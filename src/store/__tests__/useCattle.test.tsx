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

const zero = { cows: 0, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 };
const group: CattleGroup = {
  id: 'g1', farm_id: 'farm-1', name: 'Cows', class: 'cows', headCount: 20,
  counts: { ...zero, cows: 20 }, currentFieldId: 'f1', currentSince: '2026-03-10',
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
      expect(await result.current.ops.addCattleGroup({ name: 'Cows', class: 'cows', counts: { ...zero, cows: 12 } })).toBe(true);
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

  it('sends the class counts on a group edit only when the user changed one', async () => {
    const { result } = renderCattle({ groups: [group] });
    await act(async () => { expect(await result.current.ops.updateCattleGroup('g1', { name: 'Cows 2' })).toBe(true); });
    expect(enqueueMutation.mock.calls[0][2]).not.toHaveProperty('head_count');
    enqueueMutation.mockClear();
    await act(async () => { expect(await result.current.ops.updateCattleGroup('g1', { counts: { ...zero, cows: 25 } })).toBe(true); });
    expect(enqueueMutation.mock.calls[0][2]).toMatchObject({ head_count: 25, cows: 25 });
    expect(result.current.groups.value[0].headCount).toBe(25);
  });

  it('rejects an invalid count or empty name on edit', async () => {
    const { result } = renderCattle({ groups: [group] });
    await act(async () => {
      expect(await result.current.ops.updateCattleGroup('g1', { counts: { ...zero, cows: -1 } })).toBe(false);
      expect(await result.current.ops.updateCattleGroup('g1', { counts: { ...zero, cows: 1.5 } })).toBe(false);
      expect(await result.current.ops.updateCattleGroup('g1', { name: '  ' })).toBe(false);
    });
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('a failed group edit reverts only its own fields', async () => {
    let reject!: (error: Error) => void;
    enqueueMutation.mockReturnValue(new Promise<void>((_r, fail) => { reject = fail; }));
    const { result } = renderCattle({ groups: [group] });
    let edit!: Promise<boolean>;
    act(() => { edit = result.current.ops.updateCattleGroup('g1', { name: 'Renamed' }); });
    act(() => { result.current.groups.setValue(rows => rows.map(r => ({ ...r, headCount: 30, counts: { ...zero, cows: 30 } }))); });
    await act(async () => { reject(new Error('queue locked')); expect(await edit).toBe(false); });
    expect(result.current.groups.value[0]).toMatchObject({ name: 'Cows', headCount: 30 });
  });

  it('transfers head as one queued RPC with two linked events', async () => {
    const calf = { ...group, id: 'g2', name: 'Calves', headCount: 5, counts: { ...zero, cows: 5 } };
    const { result } = renderCattle({ groups: [group, calf] });
    await act(async () => {
      expect(await result.current.ops.transferCattleHead({
        fromGroupId: 'g1', toGroupId: 'g2', head: 4, eventDate: '2026-03-11',
      })).toBe(true);
    });
    expect(enqueueMutation).toHaveBeenCalledTimes(1);
    expect(enqueueMutation.mock.calls[0][2].__cattle_rpc.rpc).toBe('transfer_cattle_head');
    expect(result.current.groups.value.map(g => g.headCount)).toEqual([16, 9]);
    const [a, b] = result.current.events.value;
    expect(a.transferId).toBeTruthy();
    expect(b.transferId).toBe(a.transferId);
  });

  it('deleting one half of a transfer reverses both and floors at zero', async () => {
    const calf = { ...group, id: 'g2', name: 'Calves', headCount: 1, counts: { ...zero, cows: 1 } };
    const base = { farm_id: 'farm-1', eventDate: '2026-03-11', createdAt: 'x', updatedAt: 'x', deleted_at: null };
    const events = [
      { ...base, id: 'e1', groupId: 'g1', eventType: 'head_removed', headDelta: -4, removedReason: 'moved_to_another_group', transferId: 'e1' },
      { ...base, id: 'e2', groupId: 'g2', eventType: 'head_added', headDelta: 4, transferId: 'e1' },
    ] as unknown as CattleEvent[];
    const { result } = renderCattle({ groups: [{ ...group, headCount: 16, counts: { ...zero, cows: 16 } }, calf], events });
    await act(async () => { expect(await result.current.ops.deleteCattleEvent('e1')).toBe(true); });
    expect(result.current.events.value.every(e => e.deleted_at)).toBe(true);
    expect(result.current.groups.value.map(g => g.headCount)).toEqual([20, 0]);
  });
  it('a cow-calf herd keeps its cows when bulls are added, and events hit one class', async () => {
    const herd: CattleGroup = { ...group, id: 'h1', name: '2014 herd', class: 'mixed', headCount: 40, counts: { ...zero, cows: 30, calves: 10 } };
    const { result } = renderCattle({ groups: [herd] });
    await act(async () => {
      expect(await result.current.ops.updateCattleGroup('h1', { counts: { ...zero, cows: 30, calves: 10, bulls: 1 } })).toBe(true);
    });
    expect(result.current.groups.value[0]).toMatchObject({ headCount: 41, counts: { ...zero, cows: 30, calves: 10, bulls: 1 } });
    expect(enqueueMutation.mock.calls[0][2]).toMatchObject({ head_count: 41, cows: 30, calves: 10, bulls: 1 });

    await act(async () => {
      expect(await result.current.ops.logCattleEvent({
        groupId: 'h1', eventType: 'death', eventDate: '2026-03-11', headDelta: -1, cattleClass: 'calves',
      })).toBe(true);
    });
    expect(result.current.groups.value[0].counts).toMatchObject({ cows: 30, calves: 9, bulls: 1 });
    expect(enqueueMutation.mock.calls[1][2].__cattle_rpc.args).toMatchObject({ p_class: 'calves' });

    await act(async () => {
      expect(await result.current.ops.logCattleEvent({
        groupId: 'h1', eventType: 'death', eventDate: '2026-03-11', headDelta: -2, cattleClass: 'bulls',
      })).toBe(false);
    });

    await act(async () => {
      expect(await result.current.ops.logCattleEvent({
        groupId: 'h1', eventType: 'calving', eventDate: '2026-03-12', headDelta: 2, calfSex: 'steer',
      })).toBe(true);
    });
    expect(result.current.groups.value[0].counts.calves).toBe(11);

    await act(async () => {
      expect(await result.current.ops.logCattleEvent({
        groupId: 'h1', eventType: 'reclass', eventDate: '2026-03-12', headDelta: 0,
        cattleClass: 'calves', toClass: 'heifers', classHead: 3,
      })).toBe(true);
    });
    expect(result.current.groups.value[0]).toMatchObject({ headCount: 42, counts: { ...zero, cows: 30, calves: 8, heifers: 3, bulls: 1 } });

    const reclassId = result.current.events.value.find(item => item.eventType === 'reclass')!.id;
    await act(async () => { expect(await result.current.ops.deleteCattleEvent(reclassId)).toBe(true); });
    expect(result.current.groups.value[0].counts).toMatchObject({ calves: 11, heifers: 0 });
  });

  it('a group cached before mixed herds still takes an event', async () => {
    const old = { ...group, counts: undefined } as unknown as CattleGroup;
    const { result } = renderCattle({ groups: [old] });
    await act(async () => {
      expect(await result.current.ops.logCattleEvent({
        groupId: 'g1', eventType: 'head_added', eventDate: '2026-03-11', headDelta: 2,
      })).toBe(true);
    });
    expect(result.current.groups.value[0]).toMatchObject({ headCount: 22, counts: { ...zero, cows: 22 } });
  });

  it('tells the form when the server refuses an event for plan reasons, and rolls back', async () => {
    shouldQueueWrite.mockResolvedValue(false);
    supabaseMock.setRpcResult({ data: null, error: { code: 'P0402', message: 'premium_required:cattle_events' } });
    const onPremiumRequired = vi.fn();
    const { result } = renderCattle({ groups: [group], online: true });
    await act(async () => {
      expect(await result.current.ops.logCattleEvent(
        { groupId: 'g1', eventType: 'calving', eventDate: '2026-03-12', headDelta: 3 },
        { onPremiumRequired },
      )).toBe(false);
    });
    expect(onPremiumRequired).toHaveBeenCalledTimes(1);
    expect(result.current.events.value).toHaveLength(0);
    expect(result.current.groups.value[0].headCount).toBe(20);
    expect(enqueueMutation).not.toHaveBeenCalled();
  });
});
