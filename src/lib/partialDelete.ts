import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';

/**
 * After a bulk soft delete reports fewer rows than requested, find which ids
 * are still live and put back only those. Before this, every selected row was
 * restored and the farmer saw "Failed" even though most were deleted.
 *
 * Reads live ids (`deleted_at IS NULL`), which every SELECT policy allows.
 * Returns 'all-deleted' when none of the ids is live (some were deleted
 * earlier, so the count looked short): the delete succeeded. 'partial' when it
 * put back the still-live rows. null when nothing was deleted or the check
 * failed, so the caller keeps its full rollback.
 */
export async function rollbackOnlyStillLive<T extends { id: string }>(
  table: string,
  ids: string[],
  farmId: string,
  snapshot: { record: T; index: number }[],
  setState: Dispatch<SetStateAction<T[]>>,
): Promise<'all-deleted' | 'partial' | null> {
  let live: Set<string>;
  try {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .in('id', ids)
      .eq('farm_id', farmId)
      .is('deleted_at', null);
    if (error || !Array.isArray(data)) return null;
    live = new Set(data.map(row => String((row as { id: unknown }).id)));
  } catch {
    return null;
  }
  const deleted = ids.filter(id => !live.has(id)).length;
  if (live.size === 0) return 'all-deleted';
  if (deleted === 0) return null;

  const putBack = snapshot.filter(({ record }) => live.has(record.id)).sort((a, b) => b.index - a.index);
  setState(prev => {
    const restored = [...prev];
    for (const { record, index } of putBack) restored.splice(Math.min(index, restored.length), 0, record);
    return restored;
  });
  toast.error(`${deleted} of ${ids.length} deleted. ${live.size} could not be deleted; they are back in the list.`);
  return 'partial';
}
