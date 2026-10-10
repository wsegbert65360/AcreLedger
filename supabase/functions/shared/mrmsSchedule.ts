/**
 * Pure scheduling helpers for the MRMS ingestion Edge Functions.
 *
 * Deliberately free of Deno and remote imports so the app's Vitest suite can
 * cover the nightly-window and retry arithmetic directly; the edge functions
 * keep only the database and network calls around these functions.
 */

/** Completed hours the nightly backfill covers by default. */
export const OVERNIGHT_WINDOW_HOURS = 10

/** How far back the nightly job looks for hours that previously failed. */
export const RETRY_LOOKBACK_HOURS = 24 * 7

/** Cap on previously-failed hours merged into one nightly run's fan-out. */
export const MAX_RETRY_HOURS = 24

const MS_PER_HOUR = 60 * 60 * 1000

/** Floor an instant to the top of its UTC hour. */
export function floorToHour(instant: Date): Date {
  const floored = new Date(instant.getTime())
  floored.setUTCMinutes(0, 0, 0)
  return floored
}

/**
 * The most recent completed whole hours, newest first. A count of 10 returns
 * the previous ten hours (offsets 1..10), matching the nightly window and
 * excluding the current, still-incomplete hour.
 */
export function completedHours(now: Date, count: number): Date[] {
  const hours: Date[] = []
  for (let offset = 1; offset <= count; offset += 1) {
    hours.push(floorToHour(new Date(now.getTime() - offset * MS_PER_HOUR)))
  }
  return hours
}

/**
 * Merge previously failed/no-data hours into the recent window so an hour that
 * has aged out of the nightly window is still retried. The result is
 * newest-first, de-duplicated against the window, excludes the current
 * (still-incomplete) or any future hour, and caps the retries so one run cannot
 * fan out without bound.
 */
export function mergeRetryHours(
  recent: Date[],
  failedHours: Date[],
  now: Date,
  maxRetries: number = MAX_RETRY_HOURS,
): Date[] {
  const seen = new Set(recent.map((hour) => hour.getTime()))
  // Compare against the whole-hour bucket `now` falls in: the in-progress hour
  // is not yet complete and must not be retried.
  const currentHourMs = floorToHour(now).getTime()
  const retries: Date[] = []

  for (const failed of failedHours) {
    const floored = floorToHour(failed)
    const ms = floored.getTime()
    if (ms >= currentHourMs) continue
    if (seen.has(ms)) continue
    seen.add(ms)
    retries.push(floored)
  }

  retries.sort((a, b) => b.getTime() - a.getTime())
  return [...recent, ...retries.slice(0, Math.max(0, maxRetries))]
}
