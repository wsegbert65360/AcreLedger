/// <reference path="../deno.d.ts" />
import { withSupabase } from "npm:@supabase/server@1.4.0"
import { downloadAndDecompress, MRMS_CONFIG, extractRainfall } from '../shared/mrms.ts'

type BackfillRequest = {
  field_id?: string | null
  start_date?: string
  end_date?: string
  mode?: 'overnight'
}

type FieldCoord = { id: string; lat: number; lng: number }

export default {
  fetch: withSupabase({ auth: 'secret:automations' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, {
        status: 405,
        headers: { Allow: 'POST' },
      })
    }

    let fieldId: string | null = null

    try {
      const body = await req.json() as BackfillRequest
      fieldId = body.field_id ?? null
      const supabaseClient = ctx.supabaseAdmin

      // Default to the ten most recent completed hours for the nightly job.
      const hours: Date[] = []
      if (body.mode === 'overnight') {
        const now = new Date()
        for (let i = 1; i <= 10; i++) {
          const hour = new Date(now.getTime() - (60 * 60 * 1000 * i))
          hour.setMinutes(0, 0, 0)
          hours.push(hour)
        }
      } else if (body.start_date && body.end_date) {
        let current = new Date(body.start_date)
        const end = new Date(body.end_date)
        if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime()) || current > end) {
          return Response.json({ error: 'Invalid backfill date range' }, { status: 400 })
        }
        while (current <= end) {
          hours.push(new Date(current))
          current = new Date(current.getTime() + 60 * 60 * 1000)
        }
        hours.reverse()
      } else if (fieldId) {
        const now = new Date()
        for (let i = 0; i < 168; i++) {
          const hour = new Date(now.getTime() - (60 * 60 * 1000 * i))
          hour.setMinutes(0, 0, 0)
          hours.push(hour)
        }
      }

      if (hours.length === 0) {
        return Response.json({ error: 'No backfill range requested' }, { status: 400 })
      }

      // Decompressing a grid uses significant memory. Process one hour per
      // invocation and continue the remaining range as a background request.
      const currentHour = hours[0]
      const remainingHours = hours.slice(1)

      let fieldsQuery = supabaseClient.from('fields').select('id, lat, lng')
      fieldsQuery = fieldId
        ? fieldsQuery.eq('id', fieldId)
        : fieldsQuery.neq('id', '00000000-0000-0000-0000-000000000000')

      const { data: fields, error: fieldsError } = await fieldsQuery
      if (fieldsError) throw fieldsError
      if (!fields?.length) throw new Error('No fields found')

      if (fieldId) {
        const { error: coverageError } = await supabaseClient
          .from('field_rainfall_coverage')
          .upsert({
            field_id: fieldId,
            range_start_utc: hours[hours.length - 1].toISOString(),
            range_end_utc: hours[0].toISOString(),
            status: 'processing',
            last_checked_at: new Date().toISOString(),
          }, { onConflict: 'field_id, range_start_utc' })
        if (coverageError) throw coverageError
      }

      const tsStr = currentHour.toISOString()
        .replace(/[:\-]/g, '')
        .split('.')[0]
        .replace('T', '-')

      let gribData: Uint8Array | null = null
      let source = 'MRMS'
      for (const pass of ['Pass2', 'Pass1'] as const) {
        const filename = `MRMS_MultiSensor_QPE_01H_${pass}_00.00_${tsStr}.grib2.gz`
        const url = `${MRMS_CONFIG.baseUrl}MultiSensor_QPE_01H_${pass}/${filename}`
        gribData = await downloadAndDecompress(url)
        if (gribData) {
          source = pass === 'Pass2' ? 'Pass 2' : 'Pass 1'
          break
        }
      }

      if (gribData) {
        const typedFields = fields as FieldCoord[]
        const rainfallValues = extractRainfall(
          gribData,
          typedFields.map((field) => ({ lat: field.lat, lng: field.lng })),
        )
        const records = typedFields.map((field, index) => ({
          field_id: field.id,
          timestamp_utc: currentHour.toISOString(),
          rainfall_in: rainfallValues[index],
          source,
          finalized: source === 'Pass 2',
        }))

        const { error: saveError } = await supabaseClient
          .from('field_rainfall_hourly')
          .upsert(records, { onConflict: 'field_id, timestamp_utc' })
        if (saveError) throw saveError
      }

      if (remainingHours.length > 0) {
        const apiKey = req.headers.get('apikey')
        const projectUrl = Deno.env.get('SUPABASE_URL')
        if (!apiKey || !projectUrl) throw new Error('Missing recursive invocation configuration')

        const nextRequest = fetch(`${projectUrl}/functions/v1/mrms-backfill`, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            field_id: fieldId,
            start_date: remainingHours[remainingHours.length - 1].toISOString(),
            end_date: remainingHours[0].toISOString(),
          }),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Next backfill chunk failed with HTTP ${response.status}`)
          }
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[MRMS-Backfill] Failed to trigger next chunk: ${message}`)
        })

        EdgeRuntime.waitUntil(nextRequest)
      } else if (fieldId) {
        const { error: completionError } = await supabaseClient
          .from('field_rainfall_coverage')
          .update({ status: 'complete', last_checked_at: new Date().toISOString() })
          .eq('field_id', fieldId)
        if (completionError) throw completionError
      }

      return Response.json({
        success: true,
        processed_hours: 1,
        remaining_hours: remainingHours.length,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[MRMS-Backfill] Edge Function Error: ${message}`)

      if (fieldId) {
        const { error: failureStateError } = await ctx.supabaseAdmin
          .from('field_rainfall_coverage')
          .update({ status: 'failed', last_checked_at: new Date().toISOString() })
          .eq('field_id', fieldId)
        if (failureStateError) {
          console.error(`[MRMS-Backfill] Failed to save failure state: ${failureStateError.message}`)
        }
      }

      return Response.json({ error: message }, { status: 500 })
    }
  }),
}
