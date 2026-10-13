import { LINKED_GRAIN_MUTATION_KEY, readEquipmentRpcEnvelope, type QueuedMutation } from '@/lib/syncQueue';

/** Overlay in FIFO order before mapping and caching the authoritative snapshot.
 * Include parked work: it still belongs to the farmer until explicitly discarded. */
export function overlayQueuedRows<T extends { id?: unknown }>(
  table: string,
  rows: T[],
  queue: QueuedMutation[],
  farmId: string,
): T[] {
  const result = new Map<unknown, T>(rows.map(row => [row.id, row]));
  for (const mutation of queue) {
    if (mutation.farm_id !== farmId || readEquipmentRpcEnvelope(mutation.payload)) continue;
    const payload = mutation.table_name === table
      ? mutation.payload
      : table === 'grain_movements' && mutation.table_name === 'harvest_records'
        ? mutation.payload?.[LINKED_GRAIN_MUTATION_KEY]
        : null;
    if (!payload || typeof payload !== 'object' || !payload.id) continue;
    if (mutation.operation === 'soft_delete' || payload.deleted_at) {
      result.delete(payload.id);
      continue;
    }
    const columns = Object.fromEntries(Object.entries(payload).filter(([key]) => !key.startsWith('__')));
    result.set(payload.id, { ...result.get(payload.id), ...columns, farm_id: farmId } as unknown as T);
  }
  return [...result.values()];
}
