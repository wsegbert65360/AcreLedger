/// <reference path="../deno.d.ts" />
import { withSupabase } from "npm:@supabase/server@1.4.0"
import { downloadAndDecompress, extractRainfall, MRMS_CONFIG, validateGridConfig } from '../shared/mrms.ts'
import { dailyFileUrls, priorRainDates, targetRainDate } from '../shared/mrmsDaily.ts'
import { FIELD_PAGE_SIZE } from '../shared/mrmsFieldPage.ts'

interface FieldCoord { id: string; lat: number; lng: number }

type RunStatus = 'success' | 'no_data' | 'failed'

/** How many earlier rain dates are re-checked for a missed or provisional day. */
const RETRY_DAYS = 3
/** Source label of finalized (Pass 2) rows; anything else is provisional. */
const FINAL_SOURCE = 'MRMS 24H'

/**
 * Once-a-day rainfall for free-tier farms: the two "rainfall slot" fields per
 * free farm get one 24-hour total (8 am Central reading) from NOAA's 24H
 * accumulation file, so a single grid decode serves every free field.
 * Paid farms keep hourly collection in mrms-hourly.
 */
export default {
  fetch: withSupabase({ auth: 'secret:automations' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
    }
    const db = ctx.supabaseAdmin

    const recordRun = async (rainDate: string, run: {
      status: RunStatus; source?: string | null; fieldCount?: number | null
      recordCount?: number | null; errorMessage?: string | null
    }) => {
      const { error } = await db.from('mrms_daily_runs').upsert({
        rain_date: rainDate,
        status: run.status,
        source: run.source ?? null,
        field_count: run.fieldCount ?? null,
        record_count: run.recordCount ?? null,
        error_message: run.errorMessage ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'rain_date' })
      if (error) console.error(`[MRMS-Daily] Failed to record run for ${rainDate}: ${error.message}`)
    }

    const loadFields = async (): Promise<FieldCoord[]> => {
      const fields: FieldCoord[] = []
      let after: string | null = null
      for (;;) {
        const { data, error } = await db.rpc('rainfall_collectable_fields', {
          p_tier: 'daily', p_after: after, p_limit: FIELD_PAGE_SIZE,
        })
        if (error || !data) throw error ?? new Error('Failed to load free-tier rainfall fields')
        const page = (data as Array<{ id: string; lat: number | string; lng: number | string }>)
          .map((r) => ({ id: r.id, lat: Number(r.lat), lng: Number(r.lng) }))
        fields.push(...page)
        if (page.length < FIELD_PAGE_SIZE) break
        after = page[page.length - 1].id
      }
      return fields
    }

    // One date: download once, decode once, upsert every free field.
    const processDate = async (rainDate: string, fields: FieldCoord[]) => {
      const urls = dailyFileUrls(MRMS_CONFIG.baseUrl, rainDate)
      let grib = await downloadAndDecompress(urls.pass2)
      let source = FINAL_SOURCE
      let finalized = true
      if (!grib) {
        grib = await downloadAndDecompress(urls.pass1)
        source = 'MRMS 24H Pass 1'
        finalized = false
      }
      if (!grib) {
        await recordRun(rainDate, { status: 'no_data' })
        return { rainDate, status: 'no_data' as RunStatus, count: 0 }
      }

      const values = extractRainfall(grib, fields.map((f) => ({ lat: f.lat, lng: f.lng })))
      let records = fields.flatMap((f, i) => {
        const inches = values[i]
        if (inches == null) return []
        return [{ field_id: f.id, rain_date: rainDate, rainfall_in: inches, source, finalized }]
      })

      // A Pass 1 retry must never downgrade a row a Pass 2 run already finalized.
      if (!finalized && records.length) {
        const done = new Set<string>()
        for (let from = 0; ; from += FIELD_PAGE_SIZE) {
          const { data, error } = await db.from('field_rainfall_daily')
            .select('field_id').eq('rain_date', rainDate).eq('finalized', true)
            .order('field_id', { ascending: true }).range(from, from + FIELD_PAGE_SIZE - 1)
          if (error) throw error
          for (const r of data ?? []) done.add(r.field_id as string)
          if (!data || data.length < FIELD_PAGE_SIZE) break
        }
        records = records.filter((r) => !done.has(r.field_id))
      }

      for (let i = 0; i < records.length; i += 500) {
        const { error } = await db.from('field_rainfall_daily')
          .upsert(records.slice(i, i + 500), { onConflict: 'field_id, rain_date' })
        if (error) throw error
      }
      await recordRun(rainDate, { status: 'success', source, fieldCount: fields.length, recordCount: records.length })
      return { rainDate, status: 'success' as RunStatus, count: records.length }
    }

    try {
      validateGridConfig()
      let body: { rain_date?: string } = {}
      try { body = await req.json() } catch { /* empty body is fine */ }
      const explicitDate = !!body.rain_date && /^\d{4}-\d{2}-\d{2}$/.test(body.rain_date)
      const target = explicitDate ? body.rain_date! : targetRainDate(new Date())

      const fields = await loadFields()
      if (!fields.length) {
        await recordRun(target, { status: 'success', fieldCount: 0, recordCount: 0 })
        return Response.json({ success: true, count: 0 })
      }

      // ONE date per invocation: each decode uses a lot of memory and time (same
      // reason mrms-backfill does one hour per call). The cron fires twice a day:
      // the target date goes first; once it is final, the oldest recent date that
      // is still missing or only provisional (Pass 1) is retried.
      const prior = priorRainDates(target, RETRY_DAYS)
      const { data: runs } = await db.from('mrms_daily_runs').select('rain_date, status, source')
        .in('rain_date', [target, ...prior])
      // "Done" = finalized Pass 2 data. A Pass 1 success is provisional so a later
      // run can replace it once Pass 2 is published.
      const done = new Set((runs ?? [])
        .filter((r) => r.status === 'success' && r.source === FINAL_SOURCE)
        .map((r) => r.rain_date as string))
      const date = explicitDate || !done.has(target)
        ? target
        : [...prior].reverse().find((d) => !done.has(d))
      if (!date) return Response.json({ success: true, message: 'Nothing to do' })

      let result: { rainDate: string; status: RunStatus; count: number }
      try {
        result = await processDate(date, fields)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[MRMS-Daily] ${date} failed: ${msg}`)
        await recordRun(date, { status: 'failed', errorMessage: msg })
        result = { rainDate: date, status: 'failed', count: 0 }
      }

      // Non-2xx when the day is missing so the scheduler log shows it.
      if (result.status !== 'success') {
        return Response.json({ result }, { status: result.status === 'no_data' ? 503 : 500 })
      }
      return Response.json({ success: true, result })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[MRMS-Daily] Edge Function Error: ${msg}`)
      return Response.json({ error: msg }, { status: 500 })
    }
  }),
}
