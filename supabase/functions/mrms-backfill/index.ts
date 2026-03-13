import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { downloadAndDecompress, MRMS_CONFIG, extractRainfall } from '../shared/mrms.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req: Request) => {
  // 0. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { field_id, start_date, end_date, mode } = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Determine hours to backfill (Default to 10 days if only field_id provided)
    let hours: Date[] = []
    if (mode === 'overnight') {
        const now = new Date()
        for (let i = 1; i <= 10; i++) {
            const d = new Date(now.getTime() - (1000 * 60 * 60 * i))
            d.setMinutes(0, 0, 0)
            hours.push(d)
        }
    } else if (start_date && end_date) {
        let current = new Date(start_date)
        const end = new Date(end_date)
        while (current <= end) {
            hours.push(new Date(current))
            current.setHours(current.getHours() + 1)
        }
        hours.reverse() // Sort newest to oldest conceptually
    } else if (field_id) {
        // Default historical backfill: Last 168 hours (7 days) to match retention
        const now = new Date()
        for (let i = 0; i < 168; i++) {
            const d = new Date(now.getTime() - (1000 * 60 * 60 * i))
            d.setMinutes(0, 0, 0)
            hours.push(d)
        }
    }

    // --- CHUNKING LOGIC ---
    // Protect against the 150s Supabase function timeout by processing short bursts
    const CHUNK_SIZE = 48; // ~15-20 seconds of processing
    const currentChunk = hours.slice(0, CHUNK_SIZE);
    const remainingHours = hours.slice(CHUNK_SIZE);

    // 2. Fetch fields
    const { data: fields } = await supabaseClient
      .from('fields')
      .select('id, lat, lng')
      .filter('id', field_id ? 'eq' : 'neq', field_id || '00000000-0000-0000-0000-000000000000')

    if (!fields) throw new Error('No fields found')

    // 3. Process each hour (Simplified serial process for Edge Function stability)
    if (field_id) {
        await supabaseClient
            .from('field_rainfall_coverage')
            .upsert({ 
                field_id, 
                range_start_utc: hours[hours.length - 1].toISOString(), 
                range_end_utc: hours[0].toISOString(),
                status: 'processing',
                last_checked_at: new Date().toISOString()
            }, { onConflict: 'field_id, range_start_utc' })
    }

    for (const targetTs of currentChunk) {
        const tsStr = targetTs.toISOString().replace(/[:\-]/g, '').split('.')[0].replace('T', '-')
        
        // Try Pass2 first, then Pass1
        let gribData = null
        for (const pass of ['Pass2', 'Pass1']) {
            const filename = `MRMS_MultiSensor_QPE_01H_${pass}_00.00_${tsStr}.grib2.gz`
            const url = `${MRMS_CONFIG.baseUrl}MultiSensor_QPE_01H_${pass}/${filename}`
            gribData = await downloadAndDecompress(url)
            if (gribData) break
        }

        if (gribData) {
            const rainfallValues = extractRainfall(gribData, fields.map((f: any) => ({ lat: f.lat, lng: f.lng })))
            const records = fields.map((f: any, i: number) => ({
                field_id: f.id,
                timestamp_utc: targetTs.toISOString(),
                rainfall_in: rainfallValues[i],
                source: 'MRMS',
                finalized: true // Pass2/Historical
            }))

            await supabaseClient
                .from('field_rainfall_hourly')
                .upsert(records, { onConflict: 'field_id, timestamp_utc' })
            // No more rollup triggers needed as of the simplified SQL migration!
        }
    }

    if (remainingHours.length > 0) {
        // Fire and forget the next chunk asynchronously to avoid blocking this process
        const nextStart = remainingHours[remainingHours.length - 1].toISOString();
        const nextEnd = remainingHours[0].toISOString();
        
        console.log(`Chunk finished. Triggering next chunk: ${nextStart} to ${nextEnd}`);
        
        supabaseClient.functions.invoke('mrms-backfill', {
            body: { field_id, start_date: nextStart, end_date: nextEnd },
            headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` }
        }).catch((err: any) => console.error('Failed to trigger next chunk:', err));
        
    } else if (field_id) {
        console.log("All chunks complete. Marking coverage as complete.");
        await supabaseClient
            .from('field_rainfall_coverage')
            .update({ status: 'complete', last_checked_at: new Date().toISOString() })
            .match({ field_id, range_start_utc: hours[hours.length - 1].toISOString() })
    }

    return new Response(JSON.stringify({ 
        success: true, 
        processed_hours: currentChunk.length,
        remaining_hours: remainingHours.length
    }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error(`Edge Function Error (Backfill): ${error.message}`, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
