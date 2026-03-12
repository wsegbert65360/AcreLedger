import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { downloadAndDecompress, MRMS_CONFIG, extractRainfall } from '../shared/mrms.ts'

serve(async (req: Request) => {
  try {
    const { field_id, start_date, end_date, mode } = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Determine hours to backfill
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
    }

    // 2. Fetch fields
    const { data: fields } = await supabaseClient
      .from('fields')
      .select('id, lat, lng')
      .filter('id', field_id ? 'eq' : 'neq', field_id || '00000000-0000-0000-0000-000000000000')

    if (!fields) throw new Error('No fields found')

    // 3. Process each hour (Simplified serial process for Edge Function stability)
    for (const targetTs of hours) {
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
                rainfall_mm: rainfallValues[i],
                source: 'MRMS',
                finalized: true // Pass2/Historical
            }))

            await supabaseClient
                .from('field_rainfall_hourly')
                .upsert(records, { onConflict: 'field_id, timestamp_utc' })
            
            // Trigger rollups
            for (const f of fields) {
                await supabaseClient.rpc('rollup_field_rainfall', { 
                    p_field_id: f.id, 
                    p_date: targetTs.toISOString().split('T')[0] 
                })
            }
        }
    }

    return new Response(JSON.stringify({ success: true, processed_hours: hours.length }), { status: 200 })

  } catch (error: any) {
    console.error(`Edge Function Error (Backfill): ${error.message}`, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
