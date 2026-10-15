/** PostgREST max_rows. A single select past this silently drops the rest. */
export const FIELD_PAGE_SIZE = 1000;

type FieldIdRow = { field_id: string };

/**
 * Read every field_id for a filtered query.
 * The caller must order by field_id (or another stable unique key) and apply
 * the same filters on every page, then pass the requested range through.
 */
export async function collectPagedFieldIds(
  fetchPage: (from: number, to: number) => Promise<{ data: FieldIdRow[] | null; error: unknown }>,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += FIELD_PAGE_SIZE) {
    const to = from + FIELD_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) ids.add(row.field_id);
    if (page.length < FIELD_PAGE_SIZE) break;
  }
  return ids;
}
