/**
 * A write whose outcome we cannot know. The request may have been committed
 * server-side and only the response was lost (dead socket, 15s abort timeout,
 * captive portal), or it may never have arrived. We must NOT roll back the
 * optimistic record: doing so lets a retry re-insert the same row and
 * double-count grain. Instead we enqueue the identical mutation (same
 * client-generated id) so replay's 23505 reconcile path can adopt the row if
 * the server already has it.
 *
 * Matches:
 *  - the AbortController timeout in src/lib/supabase.ts. postgrest-js does not
 *    rethrow the abort: it wraps it as
 *    `{ message: 'AbortError: signal is aborted without reason',
 *       hint: 'Request was aborted (timeout or manual cancellation)', code: '' }`
 *    and keeps the HTTP status on the response object, so the wrapped shape is
 *    matched here too (a raw thrown AbortError is matched as well).
 *  - DNS/TLS/offline failures surfaced as TypeError ("Failed to fetch",
 *    "Load failed")
 *  - Supabase's status 0 / network-shaped transients with no HTTP status
 */
export function isUnknownMutationOutcome(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object') {
    const e = error as { name?: string; status?: number; message?: string; code?: string; hint?: string };
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
    if (e.status === 0) return true;
    if (e.name === 'TypeError') return true;
    const message = (e.message ?? '').toLowerCase();
    const hint = (e.hint ?? '').toLowerCase();
    // Wrapped abort from postgrest-js. Real Postgres/PostgREST errors always carry
    // a non-empty code, so requiring an empty code keeps e.g. "transaction is
    // aborted" (25P02) from being misread as a lost response.
    if (
      !e.code &&
      (message.includes('aborterror') ||
        message.includes('signal is aborted') ||
        hint.includes('request was aborted'))
    ) {
      return true;
    }
    if (
      e.status === undefined &&
      (message.includes('failed to fetch') ||
        message.includes('load failed') ||
        message.includes('networkerror') ||
        message.includes('network request failed') ||
        message.includes('network error') ||
        message.includes('timeout') ||
        message.includes('timed out'))
    ) {
      return true;
    }
  }
  return false;
}
