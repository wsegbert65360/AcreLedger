/**
 * Pure helpers for the once-a-day MRMS 24-hour accumulation run (free tier).
 *
 * No Deno or remote imports so the app's Vitest suite can cover them.
 * A "rain day" is the 24 hours ending 08:00 America/Chicago and is labelled
 * with the date of that 08:00 reading.
 */

const CHICAGO = 'America/Chicago'
export const DAILY_READING_HOUR_LOCAL = 8
/** NOAA needs time to publish Pass 2; try the reading this many hours late. */
export const DAILY_PUBLISH_LAG_HOURS = 2

/** Offset of America/Chicago from UTC (minutes, negative) at a given instant. */
function chicagoOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000)
}

/** UTC instant of 08:00 America/Chicago on the given local calendar date (YYYY-MM-DD). */
export function dailyReadingInstant(rainDate: string): Date {
  const [y, m, d] = rainDate.split('-').map(Number)
  // Guess with CST, then correct using the real offset on that date (handles DST).
  let guess = new Date(Date.UTC(y, m - 1, d, DAILY_READING_HOUR_LOCAL + 6, 0, 0))
  const offset = chicagoOffsetMinutes(guess)
  guess = new Date(Date.UTC(y, m - 1, d, DAILY_READING_HOUR_LOCAL, 0, 0) - offset * 60000)
  return guess
}

/** Local Chicago calendar date (YYYY-MM-DD) of an instant. */
export function chicagoDate(instant: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant)
  return p
}

/**
 * The rain date a run at `now` should collect: today's 08:00 reading once it is
 * at least DAILY_PUBLISH_LAG_HOURS old, otherwise yesterday's.
 */
export function targetRainDate(now: Date): string {
  const today = chicagoDate(now)
  const ready = dailyReadingInstant(today).getTime() + DAILY_PUBLISH_LAG_HOURS * 3600_000
  if (now.getTime() >= ready) return today
  const prev = new Date(dailyReadingInstant(today).getTime() - 12 * 3600_000)
  return chicagoDate(prev)
}

/** Previous N rain dates before `rainDate`, newest first (for retrying misses). */
export function priorRainDates(rainDate: string, count: number): string[] {
  const out: string[] = []
  const [y, m, d] = rainDate.split('-').map(Number)
  for (let i = 1; i <= count; i += 1) {
    out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10))
  }
  return out
}

/** NOAA file names/urls for a rain date's 24-hour accumulation (Pass 2 then Pass 1). */
export function dailyFileUrls(baseUrl: string, rainDate: string): { pass2: string; pass1: string } {
  const ts = dailyReadingInstant(rainDate).toISOString().replace(/[:\-]/g, '').split('.')[0].replace('T', '-')
  const mk = (pass: 'Pass1' | 'Pass2') =>
    `${baseUrl}MultiSensor_QPE_24H_${pass}/MRMS_MultiSensor_QPE_24H_${pass}_00.00_${ts}.grib2.gz`
  return { pass2: mk('Pass2'), pass1: mk('Pass1') }
}
