import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { overlayQueuedRows } from '../queuedSnapshot';
import { LINKED_GRAIN_MUTATION_KEY, type QueuedMutation } from '../syncQueue';

const mutation = (table: string, payload: Record<string, unknown>, overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
  id: 'queue-id', table_name: table, operation: 'insert', payload, farm_id: 'farm-1',
  created_at: '2026-10-12T00:00:00Z', retry_count: 0, ...overrides,
});

describe('queued snapshot overlay', () => {
  it('preserves pending and parked inserts, merges updates and removes deletes in FIFO order', () => {
    const queue = [
      mutation('fields', { id: 'local', name: 'Local' }, { retry_count: 10 }),
      mutation('fields', { id: 'cloud', name: 'Edited' }, { operation: 'update' }),
      mutation('fields', { id: 'deleted', deleted_at: '2026-10-12' }, { operation: 'soft_delete' }),
      mutation('fields', { id: 'local', name: 'Newer' }, { operation: 'update' }),
      mutation('fields', { id: 'foreign' }, { farm_id: 'farm-2' }),
    ];
    expect(overlayQueuedRows('fields', [{ id: 'cloud', name: 'Cloud', acreage: 10 }, { id: 'deleted' }], queue, 'farm-1'))
      .toEqual([{ id: 'cloud', name: 'Edited', acreage: 10, farm_id: 'farm-1' }, { id: 'local', name: 'Newer', farm_id: 'farm-1' }]);
  });

  it('overlays an atomic harvest/grain envelope into both tables and strips private replay columns', () => {
    const queue = [mutation('harvest_records', { id: 'h1', bushels: 100,
      [LINKED_GRAIN_MUTATION_KEY]: { id: 'g1', bushels: 100, __expected_version: 1 },
    })];
    expect(overlayQueuedRows('harvest_records', [], queue, 'farm-1')).toEqual([{ id: 'h1', bushels: 100, farm_id: 'farm-1' }]);
    expect(overlayQueuedRows('grain_movements', [], queue, 'farm-1')).toEqual([{ id: 'g1', bushels: 100, farm_id: 'farm-1' }]);
  });
});
