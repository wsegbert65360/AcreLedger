/// <reference path="../deno.d.ts" />
// @ts-ignore: Deno URL import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { downloadAndDecompress, MRMS_CONFIG, extractRainfall, validateGridConfig } from '../shared/mrms.ts'

interface FieldCoord { lat: number; lng: number; id: string }

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  // 0. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    const hourOffset = parseInt(Deno.env.get('MRMS_HOUR_OFFSET') || '2', 10)
    const targetTs = new Date(now.getTime() - (1000 * 60 * 60 * hourOffset))
    targetTs.setMinutes(0, 0, 0)
    
    const tsStr = targetTs.toISOString().replace(/[:\-]/g, '').split('.')[0].replace('T', '-')
    
    // Attempt Pass 2 first (more accurate), then Fallback to Pass 1
    const pass2Filename = `MRMS_MultiSensor_QPE_01H_Pass2_00.00_${tsStr}.grib2.gz`
    const pass2Url = `${MRMS_CONFIG.baseUrl}MultiSensor_QPE_01H_Pass2/${pass2Filename}`
    
    const pass1Filename = `MRMS_MultiSensor_QPE_01H_Pass1_00.00_${tsStr}.grib2.gz`
    const pass1Url = `${MRMS_CONFIG.baseUrl}MultiSensor_QPE_01H_Pass1/${pass1Filename}`

    validateGridConfig()
    console.log(`Processing hour: ${targetTs.toISOString()}`)

    // 1. Fetch all fields
    const { data: fields, error: fieldsError } = await supabaseClient
      .from('fields')
      .select('id, lat, lng')
    
    if (fieldsError || !fields) throw new Error('Failed to fetch fields')

    // 2. Download and Decompress (Try Pass 2, then Pass 1)
    let gribData = await downloadAndDecompress(pass2Url)
    let source = 'Pass 2'
    
    if (!gribData) {
        console.log(`Pass 2 not available, trying Pass 1...`)
        gribData = await downloadAndDecompress(pass1Url)
        source = 'Pass 1'
    }

    if (!gribData) {
        console.log(`No MRMS data available for ${targetTs.toISOString()}`)
        return new Response(JSON.stringify({ message: 'No data available yet' }), { status: 200 })
    }

    console.log(`Using ${source} data from ${source === 'Pass 2' ? pass2Url : pass1Url}`)

    // 3. Extract logic
    const rainfallValues = extractRainfall(gribData, fields.map((f: FieldCoord) => ({ lat: f.lat, lng: f.lng })))

    const records = fields.map((f: FieldCoord, i: number) => ({
      field_id: f.id,
      timestamp_utc: targetTs.toISOString(),
      rainfall_in: rainfallValues[i],
      source: source,
      finalized: source === 'Pass 2' // Pass 2 is considered finalized
    }))

    // 4. Save
    const { error: saveError } = await supabaseClient
      .from('field_rainfall_hourly')
      .upsert(records, { onConflict: 'field_id, timestamp_utc' })

    if (saveError) throw saveError

    // 5. Success
    console.log(`Successfully processed ${records.length} rainfall records for ${targetTs.toISOString()}`)

    return new Response(JSON.stringify({ success: true, count: records.length }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[MRMS-Hourly] Edge Function Error: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
