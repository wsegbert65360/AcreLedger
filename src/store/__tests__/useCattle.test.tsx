/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, useStatefulArray } from '@/test/hookTestHarness';
import { createSupabaseMock } from '@/test/supabaseMock';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const supabaseMock = createSupabaseMock();
const enqueueMutation = vi.fn();
const shouldQueueWrite = vi.fn(async () => true);

vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
vi.doMock('@/lib/syncQueue', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/syncQueue')>();
  return {
    ...original,
    syncQueue: { enqueueMutation, shouldQueueWrite, kickReplay: vi.fn() },
  };
});
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useCattle: (typeof import('../useCattle'))['useCattle'];

beforeAll(async () => { ({ useCattle } = await import('../useCattle')); });

const group: CattleGroup = {
  id: 'g1', farm_id: 'farm-1', name: 'Cows', class: 'cows', headCount: 20,
  currentFieldId: 'f1', currentSince: '2026-03-10',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};

function renderCattle(options: {
  groups?: CattleGroup[];
  moves?: CattleMove[];
  events?: CattleEvent[];
  online?: boolean;
} = {}) {
  return renderHook(() => {
    const groups = useStatefulArray(options.groups ?? []);
    const moves = useStatefulArray(options.moves ?? []);
    const events = useStatefulArray(options.events ?? []);
    const ops = useCattle({
      farm_id: 'farm-1', cattleGroups: groups.value, cattleMoves: moves.value,
      cattleEvents: events.value, setCattleGroups: groups.setValue,
      setCattleMoves: moves.setValue, setCattleEvents: events.setValue,
      isOnline: options.online ?? false,
    });
    return { groups, moves, events, ops };
  });
}

beforeEach(() => {
  supabaseMock.reset();
  enqueueMutation.mockReset().mockResolvedValue(undefined);
  shouldQueueWrite.mockReset().mockResolvedValue(true);
});

describe('useCattle', () => {
  it('queues a mapped group insert with an explicit active tombstone', async () => {
    const { result } = renderCattle();
    await act(async () => {
      expect(await result.current.ops.addCattleGroup({ name: 'Cows', class: 'cows', headCount: 12 })).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledWith('cattle_groups', 'insert', expect.objectContaining({
      farm_id: 'farm-1', head_count: 12, deleted_at: null,
    }), 'farm-1');
  });

  it('saves a back-dated move without changing current pasture', async () => {
    const { result } = renderCattle({ groups: [group] });
    await act(async () => {
      expect(await result.current.ops.moveCattleGroup({ groupId: 'g1', fieldId: 'f2', movedOn: '2026-03-01' })).toBe(true);
    });
    expect(result.current.moves.value).toHaveLength(1);
    expect(result.current.groups.value[0]).toMatchObject({ currentFieldId: 'f1', currentSince: '2026-03-10' });
    expect(enqueueMutation).toHaveBeenCalledWith('cattle_moves', 'insert', expect.objectContaining({
      __cattle_rpc: expect.objectContaining({ rpc: 'move_cattle_group' }),
    }), 'farm-1');
  });

  it('applies an event delta and queues one atomic RPC', async () => {
    const { result } = renderCattle({ groups: [group] });
    await act(async () => {
      expect(await result.current.ops.logCattleEvent({
        groupId: 'g1', eventType: 'death', eventDate: '2026-03-11', headDelta: -2,
      })).toBe(true);
    });
    expect(result.current.groups.value[0].headCount).toBe(18);
    expect(enqueueMutation).toHaveBeenCalledWith('cattle_events', 'insert', expect.objectContaining({
      __cattle_rpc: expect.objectContaining({ rpc: 'log_cattle_event' }),
    }), 'farm-1');
  });

  it('rolls back only touched ids when a group cascade enqueue fails', async () => {
    let reject!: (error: Error) => void;
    enqueueMutation.mockReturnValue(new Promise<void>((_resolve, fail) => { reject = fail; }));
    const other = { ...group, id: 'g2', name: 'Calves' };
    const { result } = renderCattle({ groups: [group, other] });
    let deletion!: Promise<boolean>;
    act(() => { deletion = result.current.ops.deleteCattleGroup('g1'); });
    act(() => {
      result.current.groups.setValue(rows => rows.map(item => item.id === 'g2' ? { ...item, name: 'Edited' } : item));
    });
    await act(async () => { reject(new Error('queue locked')); expect(await deletion).toBe(false); });
    expect(result.current.groups.value.find(item => item.id === 'g1')).toEqual(group);
    expect(result.current.groups.value.find(item => item.id === 'g2')?.name).toBe('Edited');
  });
});
