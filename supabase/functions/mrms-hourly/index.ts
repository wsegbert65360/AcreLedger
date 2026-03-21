/// <reference path="../deno.d.ts" />
// @ts-ignore: Deno URL import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Deno URL import
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    // Most recent valid hour is T-1 or T-2
    const targetTs = new Date(now.getTime() - (1000 * 60 * 60 * 2))
    targetTs.setMinutes(0, 0, 0)
    
    const tsStr = targetTs.toISOString().replace(/[:\-]/g, '').split('.')[0].replace('T', '-')
    const filename = `MRMS_MultiSensor_QPE_01H_Pass1_00.00_${tsStr}.grib2.gz`
    const url = `${MRMS_CONFIG.baseUrl}MultiSensor_QPE_01H_Pass1/${filename}`

    console.log(`Processing hour: ${targetTs.toISOString()} from ${url}`)

    // 1. Fetch all fields
    const { data: fields, error: fieldsError } = await supabaseClient
      .from('fields')
      .select('id, lat, lng')
    
    if (fieldsError || !fields) throw new Error('Failed to fetch fields')

    // 2. Download and Decompress
    const gribData = await downloadAndDecompress(url)
    if (!gribData) {
        return new Response(JSON.stringify({ message: 'No data available yet' }), { status: 200 })
    }

    // 3. Extract logic
    const rainfallValues = extractRainfall(gribData, fields.map((f: any) => ({ lat: f.lat, lng: f.lng })))

    const records = fields.map((f: any, i: number) => ({
      field_id: f.id,
      timestamp_utc: targetTs.toISOString(),
      rainfall_in: rainfallValues[i],
      source: 'MRMS',
      finalized: true
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

  } catch (error: any) {
    console.error(`Edge Function Error: ${error.message}`, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
