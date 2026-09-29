/// <reference path="../deno.d.ts" />
import { withSupabase } from "npm:@supabase/server@1.4.0"
import { downloadAndDecompress, MRMS_CONFIG, extractRainfall, validateGridConfig } from '../shared/mrms.ts'

interface FieldCoord { lat: number; lng: number; id: string }

const FIELD_PAGE_SIZE = 1000

export default {
  fetch: withSupabase({ auth: 'secret:automations' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, {
        status: 405,
        headers: { Allow: 'POST' },
      })
    }

    try {
      const supabaseClient = ctx.supabaseAdmin

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

    // 1. Fetch all fields. PostgREST caps one response at max_rows (1,000),
    // so an unpaged select silently omitted farms after the first page.
    const fields: FieldCoord[] = []
    for (let from = 0; ; from += FIELD_PAGE_SIZE) {
      const { data, error } = await supabaseClient
        .from('fields')
        .select('id, lat, lng')
        .order('id', { ascending: true })
        .range(from, from + FIELD_PAGE_SIZE - 1)
      if (error || !data) throw error ?? new Error('Failed to fetch fields')
      fields.push(...(data as FieldCoord[]))
      if (data.length < FIELD_PAGE_SIZE) break
    }

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
    const rainfallValues = extractRainfall(gribData, fields.map((f) => ({ lat: f.lat, lng: f.lng })))

    const records = fields.map((f, i: number) => ({
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

      return Response.json({ success: true, count: records.length })

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[MRMS-Hourly] Edge Function Error: ${msg}`)
      return Response.json({ error: msg }, {
        status: 500,
      })
    }
  }),
}
