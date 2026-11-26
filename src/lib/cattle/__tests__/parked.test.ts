import { describe, expect, it } from 'vitest';
import { applyParkedCattleMutations, queuedRunsCattle } from '../parked';
import type { QueuedMutation } from '@/lib/syncQueue';
import type { CattleEvent, CattleGroup } from '@/types/cattle';

const group: CattleGroup = {
  id: 'g1', farm_id: 'farm-1', name: 'Cows', class: 'cows', headCount: 12,
  counts: { cows: 12, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 },
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
    const result = applyParkedCattleMutations([{ ...group, headCount: 10, counts: { ...group.counts, cows: 10 } }], [], [], [queued], true);
    expect(result.groups[0].headCount).toBe(12);
    expect(result.events).toHaveLength(1);
  });

  it('applies a queued transfer as two linked events and moves head between groups', () => {
    const calves: CattleGroup = { ...group, id: 'g2', name: 'Calves', headCount: 3, counts: { ...group.counts, cows: 3 } };
    const transfer: QueuedMutation = {
      ...queued, id: 'q2',
      payload: {
        id: 'ta', farm_id: 'farm-1', group_id: 'g1', event_type: 'head_removed', event_date: '2026-01-03',
        head_delta: -4, reason: 'moved_to_another_group', transfer_id: 'ta',
        created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z', deleted_at: null,
        __cattle_rpc: { rpc: 'transfer_cattle_head', args: {
          p_from_event_id: 'ta', p_to_event_id: 'tb', p_from_group_id: 'g1', p_to_group_id: 'g2',
          p_head: 4, p_event_date: '2026-01-03', p_notes: null,
        } },
      },
    };
    const result = applyParkedCattleMutations([group, calves], [], [], [transfer], true);
    expect(result.groups.map(g => g.headCount)).toEqual([8, 7]);
    expect(result.events.map(e => e.id).sort()).toEqual(['ta', 'tb']);
    expect(result.events.every(e => e.transferId === 'ta')).toBe(true);
    // Replaying over a snapshot that already holds the transfer does not double-apply.
    const again = applyParkedCattleMutations(result.groups, [], result.events, [transfer], true);
    expect(again.groups.map(g => g.headCount)).toEqual([8, 7]);
  });
});

describe('queued cattle setting', () => {
  const toggle = (id: string, value: boolean, retry_count = 0, farm_id = 'farm-1'): QueuedMutation => ({
    id, table_name: 'farms', operation: 'update', farm_id, created_at: '2026-01-02T00:00:00Z', retry_count,
    payload: { id: farm_id, __cattle_rpc: { rpc: 'set_runs_cattle', args: { p_runs_cattle: value } } },
  });

  it('returns the newest waiting switch for the farm', () => {
    expect(queuedRunsCattle([toggle('a', true), toggle('b', false)], 'farm-1')).toBe(false);
    expect(queuedRunsCattle([toggle('a', true)], 'farm-1')).toBe(true);
  });

  it('ignores other farms, parked switches and other queued changes', () => {
    expect(queuedRunsCattle([queued, toggle('a', true, 0, 'farm-2'), toggle('b', true, 99)], 'farm-1')).toBeNull();
  });
});
