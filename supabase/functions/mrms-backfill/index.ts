/// <reference path="../deno.d.ts" />
import { withSupabase } from "npm:@supabase/server@1.4.0"
import { downloadAndDecompress, MRMS_CONFIG, extractRainfall } from '../shared/mrms.ts'
import {
  completedHours,
  floorToHour,
  mergeRetryHours,
  OVERNIGHT_WINDOW_HOURS,
  RETRY_LOOKBACK_HOURS,
} from '../shared/mrmsSchedule.ts'

type BackfillRequest = {
  field_id?: string | null
  start_date?: string
  end_date?: string
  mode?: 'overnight'
}

type FieldCoord = { id: string; lat: number; lng: number }
type RunType = 'hourly' | 'overnight' | 'backfill'
type RunStatus = 'success' | 'no_data' | 'failed'

const FIELD_PAGE_SIZE = 1000
// One invocation is chained per hour, so an unbounded range is an unbounded
// fan-out. 31 days of hours is more than any legitimate backfill needs.
const MAX_BACKFILL_HOURS = 24 * 31
const MS_PER_HOUR = 60 * 60 * 1000
// Bound the retry sweep's read; mergeRetryHours caps how many are actually used.
const RETRY_QUERY_LIMIT = 200

export default {
  fetch: withSupabase({ auth: 'secret:automations' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, {
        status: 405,
        headers: { Allow: 'POST' },
      })
    }

    const supabaseClient = ctx.supabaseAdmin
    let fieldId: string | null = null
    let currentHourIso: string | null = null
    let runType: RunType = 'backfill'

    // Persist every processed hour's outcome, including the scheduled
    // (field_id = null) runs that previously recorded nothing.
    const recordRun = async (targetHour: string, run: {
      status: RunStatus
      source?: string | null
      fieldCount?: number | null
      recordCount?: number | null
      errorMessage?: string | null
    }) => {
      const { error } = await supabaseClient
        .from('mrms_ingestion_runs')
        .upsert({
          target_hour: targetHour,
          run_type: runType,
          status: run.status,
          source: run.source ?? null,
          field_count: run.fieldCount ?? null,
          record_count: run.recordCount ?? null,
          error_message: run.errorMessage ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'target_hour' })
      if (error) {
        console.error(`[MRMS-Backfill] Failed to record ingestion run: ${error.message}`)
      }
    }

    try {
      const body = await req.json() as BackfillRequest
      fieldId = body.field_id ?? null
      runType = body.mode === 'overnight' ? 'overnight' : 'backfill'

      // Default to the ten most recent completed hours for the nightly job.
      let hours: Date[] = []
      if (body.mode === 'overnight') {
        const now = new Date()
        hours = completedHours(now, OVERNIGHT_WINDOW_HOURS)
        // An hour that failed and then aged out of the ten-hour window was never
        // retried. Pull recent failures back in so they get another attempt.
        const lookbackIso = new Date(now.getTime() - RETRY_LOOKBACK_HOURS * MS_PER_HOUR).toISOString()
        const { data: failedRuns, error: failedError } = await supabaseClient
          .from('mrms_ingestion_runs')
          .select('target_hour')
          .in('status', ['failed', 'no_data'])
          .gte('target_hour', lookbackIso)
          .order('target_hour', { ascending: false })
          .limit(RETRY_QUERY_LIMIT)
        if (failedError) {
          console.error(`[MRMS-Backfill] Failed to load retry hours: ${failedError.message}`)
        } else if (failedRuns?.length) {
          hours = mergeRetryHours(
            hours,
            failedRuns.map((row: { target_hour: string }) => new Date(row.target_hour)),
            now,
          )
        }
      } else if (body.start_date && body.end_date) {
        let current = new Date(body.start_date)
        const end = new Date(body.end_date)
        if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime()) || current > end) {
          return Response.json({ error: 'Invalid backfill date range' }, { status: 400 })
        }
        if ((end.getTime() - current.getTime()) / MS_PER_HOUR > MAX_BACKFILL_HOURS) {
          return Response.json({ error: 'Backfill range too large' }, { status: 400 })
        }
        while (current <= end) {
          hours.push(new Date(current))
          current = new Date(current.getTime() + MS_PER_HOUR)
        }
        hours.reverse()
      } else if (fieldId) {
        const now = new Date()
        for (let i = 0; i < 168; i++) {
          hours.push(floorToHour(new Date(now.getTime() - i * MS_PER_HOUR)))
        }
      }

      if (hours.length === 0) {
        return Response.json({ error: 'No backfill range requested' }, { status: 400 })
      }

      // Decompressing a grid uses significant memory. Process one hour per
      // invocation and continue the remaining range as a background request.
      const currentHour = hours[0]
      const remainingHours = hours.slice(1)
      currentHourIso = currentHour.toISOString()

      const fields: FieldCoord[] = []
      for (let from = 0; ; from += FIELD_PAGE_SIZE) {
        let fieldsQuery = supabaseClient
          .from('fields')
          .select('id, lat, lng')
          // Deleted fields and fields without coordinates must not receive
          // genuine-looking zero rainfall.
          .is('deleted_at', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('id', { ascending: true })
          .range(from, from + FIELD_PAGE_SIZE - 1)
        fieldsQuery = fieldId
          ? fieldsQuery.eq('id', fieldId)
          : fieldsQuery.neq('id', '00000000-0000-0000-0000-000000000000')

        const { data, error } = await fieldsQuery
        if (error || !data) throw error ?? new Error('Failed to fetch fields')
        fields.push(...(data as FieldCoord[]))
        if (data.length < FIELD_PAGE_SIZE) break
      }

      if (!fields.length) {
        if (fieldId) throw new Error('No fields found')
        // Nothing to ingest, but not a failure: record success so an hour with
        // no farm coordinates is not retried forever.
        await recordRun(currentHourIso, { status: 'success', fieldCount: 0, recordCount: 0 })
        return Response.json({ success: true, processed_hours: 0, remaining_hours: 0 })
      }

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

      const tsStr = currentHourIso
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

      if (!gribData) {
        console.warn(`[MRMS-Backfill] No MRMS data for ${currentHour.toISOString()}; recorded for retry`)
        await recordRun(currentHourIso, { status: 'no_data' })
        if (fieldId) {
          const { error: coverageError } = await supabaseClient
            .from('field_rainfall_coverage')
            .update({ status: 'failed', last_checked_at: new Date().toISOString() })
            .eq('field_id', fieldId)
          if (coverageError) {
            console.error(`[MRMS-Backfill] Failed to save coverage no-data state: ${coverageError.message}`)
          }
        }
      } else {
        const typedFields = fields as FieldCoord[]
        const rainfallValues = extractRainfall(
          gribData,
          typedFields.map((field) => ({ lat: field.lat, lng: field.lng })),
        )
        let records = typedFields.map((field, index) => ({
          field_id: field.id,
          timestamp_utc: currentHourIso,
          rainfall_in: rainfallValues[index],
          source,
          finalized: source === 'Pass 2',
        }))

        // Never downgrade a Pass 2 result with a later Pass 1 retry.
        if (source === 'Pass 1') {
          const { data: finalizedRows, error: finalizedError } = await supabaseClient
            .from('field_rainfall_hourly')
            .select('field_id')
            .eq('timestamp_utc', currentHourIso)
            .eq('finalized', true)
          if (finalizedError) throw finalizedError
          const finalizedIds = new Set((finalizedRows ?? []).map((row: { field_id: string }) => row.field_id))
          if (finalizedIds.size) {
            records = records.filter((record) => !finalizedIds.has(record.field_id))
          }
        }

        if (records.length) {
          const { error: saveError } = await supabaseClient
            .from('field_rainfall_hourly')
            .upsert(records, { onConflict: 'field_id, timestamp_utc' })
          if (saveError) throw saveError
        }

        await recordRun(currentHourIso, {
          status: 'success',
          source,
          fieldCount: fields.length,
          recordCount: records.length,
        })
      }

      if (remainingHours.length > 0) {
        const apiKey = req.headers.get('apikey')
        const projectUrl = Deno.env.get('SUPABASE_URL')
        if (!apiKey || !projectUrl) throw new Error('Missing recursive invocation configuration')

        const nextHourIso = remainingHours[0].toISOString()
        const nextRequest = fetch(`${projectUrl}/functions/v1/mrms-backfill`, {
          method: 'POST',
          headers: {
            apikey: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            field_id: fieldId,
            start_date: remainingHours[remainingHours.length - 1].toISOString(),
            end_date: nextHourIso,
          }),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Next backfill chunk failed with HTTP ${response.status}`)
          }
        }).catch(async (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[MRMS-Backfill] Failed to trigger next chunk: ${message}`)
          // Record the un-run chunk so the nightly retry sweep picks it back up,
          // and don't leave a field's coverage stuck at 'processing'.
          await recordRun(nextHourIso, { status: 'failed', errorMessage: `Chain trigger failed: ${message}` })
          if (fieldId) {
            const { error: chainFailureError } = await supabaseClient
              .from('field_rainfall_coverage')
              .update({ status: 'failed', last_checked_at: new Date().toISOString() })
              .eq('field_id', fieldId)
            if (chainFailureError) {
              console.error(`[MRMS-Backfill] Failed to save chain failure state: ${chainFailureError.message}`)
            }
          }
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

      if (currentHourIso) {
        await recordRun(currentHourIso, { status: 'failed', errorMessage: message })
      }
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
