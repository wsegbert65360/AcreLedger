/**
 * Client-side pagination for complete-collection reads.
 *
 * The Supabase Data API caps any single response at `max_rows` (1,000 in
 * supabase/config.toml), so an unpaginated `select('*')` silently truncates
 * larger collections — bin inventory, activity history, compliance reports,
 * and backups would all look successful while missing rows.
 *
 * Pages are offset-based (`from`–`to`, inclusive). Callers MUST order the
 * query by a unique tiebreaker (`id`) so the total order is deterministic;
 * without it, rows can be skipped or duplicated between pages.
 */

export interface PagedFetchError {
  message: string;
}

export interface PagedFetchResult<T> {
  data: T[] | null;
  error: PagedFetchError | null;
}

/** Matches the Data API `max_rows` cap so each page is one full response. */
export const COMPLETE_COLLECTION_PAGE_SIZE = 1000;

/**
 * Reads every row of a collection, one page at a time, until a page comes
 * back short. Any page error aborts the read and returns no rows so callers
 * can never mistake a partial collection for a complete one.
 */
export async function fetchAllPages<T>(
  makePage: (from: number, to: number) => PromiseLike<PagedFetchResult<T>>,
  pageSize: number = COMPLETE_COLLECTION_PAGE_SIZE,
): Promise<{ rows: T[]; error: PagedFetchError | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makePage(from, from + pageSize - 1);
    if (error) return { rows: [], error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null };
  }
}
