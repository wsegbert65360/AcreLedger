import { describe, expect, it } from 'vitest';
import { applyParkedCattleMutations } from '../parked';
import type { QueuedMutation } from '@/lib/syncQueue';
import type { CattleEvent, CattleGroup } from '@/types/cattle';

const group: CattleGroup = {
  id: 'g1', farm_id: 'farm-1', name: 'Cows', class: 'cows', headCount: 12,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};
const event: CattleEvent = {
  id: 'e1', farm_id: 'farm-1', groupId: 'g1', eventType: 'head_added', eventDate: '2026-01-02', headDelta: 2,
  createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', deleted_at: null,
};
const queued: QueuedMutation = {
  id: 'q1', table_name: 'cattle_events', operation: 'insert', farm_id: 'farm-1',
  created_at: '2026-01-02T00:00:00Z', retry_count: 0,
  payload: {
    id: 'e1', farm_id: 'farm-1', group_id: 'g1', event_type: 'head_added', event_date: '2026-01-02',
    head_delta: 2, created_at: event.createdAt, updated_at: event.updatedAt, deleted_at: null,
    __cattle_rpc: { rpc: 'log_cattle_event', args: { p_group_id: 'g1', p_head_delta: 2 } },
  },
};

describe('parked cattle overlays', () => {
  it('does not apply an event delta twice when the queued event is already cached or committed', () => {
    const result = applyParkedCattleMutations([group], [], [event], [queued], true);
    expect(result.groups[0].headCount).toBe(12);
    expect(result.events).toHaveLength(1);
  });

  it('applies an event and its delta when the server snapshot does not contain it', () => {
    const result = applyParkedCattleMutations([{ ...group, headCount: 10 }], [], [], [queued], true);
    expect(result.groups[0].headCount).toBe(12);
    expect(result.events).toHaveLength(1);
  });
});
