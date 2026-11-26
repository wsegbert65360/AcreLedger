import { supabase } from '@/lib/supabase';

/**
 * Tables whose client SELECT policy hides deleted rows. A direct
 * `.update({ deleted_at })` on them fails RLS (Postgres checks the new row
 * against the SELECT policy), so they are retired through the
 * `soft_delete_farm_rows` RPC (migration 20261122055358).
 */
export const RPC_SOFT_DELETE_TABLES = [
  'custom_spray_records',
  'work_requests',
  'maintenance_schedules',
  'maintenance_logs',
] as const;

export type RpcSoftDeleteTable = typeof RPC_SOFT_DELETE_TABLES[number];

export function usesSoftDeleteRpc(table: string): table is RpcSoftDeleteTable {
  return (RPC_SOFT_DELETE_TABLES as readonly string[]).includes(table);
}

/**
 * Soft-deletes `ids` for `farmId`. Returns the PostgREST-style `{ error, count }`
 * where `count` is how many requested ids are now deleted. The RPC is
 * idempotent, so an already-deleted row counts as done.
 */
export async function softDeleteRows(
  table: RpcSoftDeleteTable,
  ids: string[],
  farmId: string,
  deletedAt: string = new Date().toISOString(),
): Promise<{ error: any; count: number | null; status?: number }> {
  const uniqueIds = [...new Set(ids)];
  const { data, error, status } = await supabase.rpc('soft_delete_farm_rows', {
    p_farm_id: farmId,
    p_table: table,
    p_ids: uniqueIds,
    p_deleted_at: deletedAt,
  });
  return { error, status, count: typeof data === 'number' ? data : null };
}
