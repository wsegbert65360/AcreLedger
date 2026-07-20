/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { GrainMovement } from '@/types/farm';
import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';

// --- Mocks (established before the dynamic hook import) -------------------
// The mapper is mocked so the mapper-throws contract can be driven via
// mockImplementationOnce. Otherwise valid grain records would never make
// mapGrainToDb throw naturally.
const mapGrainToDb = vi.fn();
const supabaseMock = createSupabaseMock();
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();

vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
vi.doMock('@/lib/mappers', () => ({ mapGrainToDb }));
vi.doMock('@/lib/syncQueue', () => ({
  syncQueue: { enqueueMutation, enqueueMutations },
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useGrainMovements: (typeof import('../useGrainMovements'))['useGrainMovements'];
beforeAll(async () => {
  ({ useGrainMovements } = await import('../useGrainMovements'));
});

const FARM = 'farm-1';
const SEASON = 2026;

const existingMovement = (overrides: Partial<GrainMovement> = {}): GrainMovement => ({
  id: 'g-existing',
  binId: 'b1',
  binName: 'Bin A',
  type: 'in',
  bushels: 1000,
  moisturePercent: 15,
  timestamp: 1700000000000,
  seasonYear: SEASON,
  farm_id: FARM,
  deleted_at: null,
  ...overrides,
});

// Minimal valid input for add. The hook stamps id/seasonYear/deleted_at/
// farm_id itself; timestamp is accepted (optional in spirit) but the public
// Omit type leaves it required, so include it explicitly.
const addInput = {
  binId: 'b1',
  binName: 'Bin A',
  type: 'in' as const,
  bushels: 500,
  moisturePercent: 14,
  timestamp: 1700000000000,
};

interface RenderOpts {
  farm_id?: string | null;
  initial?: GrainMovement[];
  isOnline?: boolean;
}

function renderGrainHook(opts: RenderOpts = {}) {
  return renderHook(({ farm_id, initial, isOnline }) => {
    const grains = useStatefulArray<GrainMovement>(initial ?? []);
    const onMutation = vi.fn();
    const ops = useGrainMovements({
      farm_id,
      viewingSeason: SEASON,
      grainMovements: grains.value,
      setGrainMovements: grains.setValue,
      isOnline,
      onMutation,
    });
    return { grains, ops, onMutation };
  }, {
    initialProps: {
      farm_id: opts.farm_id === undefined ? FARM : opts.farm_id,
      initial: opts.initial,
      isOnline: opts.isOnline ?? true,
    },
  });
}

beforeEach(() => {
  supabaseMock.reset();
  enqueueMutation.mockReset();
  enqueueMutations.mockReset();
  enqueueMutation.mockResolvedValue(undefined);
  enqueueMutations.mockResolvedValue(undefined);
  // By default the mapper returns a passthrough payload; individual tests
  // override with mockImplementationOnce to throw.
  mapGrainToDb.mockReset();
  mapGrainToDb.mockImplementation((r: GrainMovement) => ({ ...r }));
});

// ---------------------------------------------------------------------------
describe('useGrainMovements — addGrainMovement', () => {
  it('rejects when farm_id is null (no state change, no supabase call)', async () => {
    const { result } = renderGrainHook({ farm_id: null });
    const before = result.current.grains.value;

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(false);
    expect(result.current.grains.value).toBe(before);
    expect(supabaseMock.fns.from).not.toHaveBeenCalled();
  });

  it('rolls back and returns false when the mapper throws (state + supabase untouched)', async () => {
    mapGrainToDb.mockImplementationOnce(() => { throw new Error('map failed'); });
    const { result } = renderGrainHook();
    const before = result.current.grains.value;

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(false);
    expect(result.current.grains.value).toEqual(before);
    expect(supabaseMock.fns.from).not.toHaveBeenCalled();
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('appends the record and returns true on online success', async () => {
    supabaseMock.setResult({ data: null, error: null, count: null });
    const { result } = renderGrainHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(true);
    expect(result.current.grains.value).toHaveLength(1);
    expect(result.current.grains.value[0]).toMatchObject({
      ...addInput,
      seasonYear: SEASON,
      farm_id: FARM,
      deleted_at: null,
    });
    expect(supabaseMock.fns.insert).toHaveBeenCalledWith([expect.objectContaining({ bushels: 500 })]);
  });

  it('rolls back the appended record when supabase returns an error', async () => {
    supabaseMock.setResult({ data: null, error: { message: 'insert failed' }, count: null });
    const { result } = renderGrainHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.grains.value).toHaveLength(0));
  });

  it('enqueues on the offline path and returns true', async () => {
    const { result } = renderGrainHook({ isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(true);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'grain_movements', 'insert', expect.objectContaining({ farm_id: FARM }), FARM,
    );
    expect(result.current.grains.value).toHaveLength(1);
  });

  it('rolls back the offline record when enqueue rejects', async () => {
    enqueueMutation.mockRejectedValueOnce(new Error('queue full'));
    const { result } = renderGrainHook({ isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.grains.value).toHaveLength(0));
  });
});

// ---------------------------------------------------------------------------
describe('useGrainMovements — updateGrainMovement', () => {
  it('aborts (false, no supabase call) when the record is not in local state', async () => {
    const { result } = renderGrainHook({ initial: [] });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement(existingMovement({ id: 'missing' }));
    });

    expect(ok).toBe(false);
    expect(supabaseMock.fns.update).not.toHaveBeenCalled();
  });

  it('replaces the record and returns true on online success', async () => {
    supabaseMock.setResult({ count: 1, data: null, error: null });
    const start = existingMovement({ bushels: 1000 });
    const { result } = renderGrainHook({ initial: [start] });
    const updated = { ...start, bushels: 900 };

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.updateGrainMovement(updated); });

    expect(ok).toBe(true);
    expect(result.current.grains.value[0].bushels).toBe(900);
  });

  it('rolls back to previous on supabase error', async () => {
    supabaseMock.setResult({ count: null, data: null, error: { message: 'boom' } });
    const start = existingMovement({ bushels: 1000 });
    const { result } = renderGrainHook({ initial: [start] });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement({ ...start, bushels: 777 });
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.grains.value[0].bushels).toBe(1000));
  });

  it('rolls back on count=0 with a usable fingerprint (concurrency conflict)', async () => {
    supabaseMock.setResult({ count: 0, data: null, error: null });
    const start = existingMovement({ timestamp: 1700000000000 });
    const { result } = renderGrainHook({ initial: [start] });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement({ ...start, bushels: 1 });
    });

    expect(ok).toBe(false);
    // The fingerprint guard must have added a timestamp eq filter.
    expect(supabaseMock.fns.eq).toHaveBeenCalledWith('timestamp', expect.any(String));
    await waitFor(() => expect(result.current.grains.value[0].bushels).toBe(1000));
  });

  it('rolls back on count=0 with NO fingerprint (legacy self-heal still updates)', async () => {
    // timestamp <= 0 means no usable fingerprint → update must NOT add a
    // timestamp eq (self-heal path). Zero rows still rolls back locally.
    supabaseMock.setResult({ count: 0, data: null, error: null });
    const start = existingMovement({ timestamp: 0 });
    const { result } = renderGrainHook({ initial: [start] });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement({ ...start, bushels: 1 });
    });

    expect(ok).toBe(false);
    // Self-heal: no timestamp eq was appended to the chain.
    const timestampEqCalls = supabaseMock.fns.eq.mock.calls.filter(c => c[0] === 'timestamp');
    expect(timestampEqCalls).toHaveLength(0);
  });

  it('preserves negative bushels (does not clamp) through the mapped payload', async () => {
    supabaseMock.setResult({ count: 1, data: null, error: null });
    const start = existingMovement({ bushels: 1000 });
    const { result } = renderGrainHook({ initial: [start] });

    await act(async () => {
      await result.current.ops.updateGrainMovement({ ...start, bushels: -50 });
    });

    expect(mapGrainToDb).toHaveBeenCalledWith(expect.objectContaining({ bushels: -50 }));
    expect(result.current.grains.value[0].bushels).toBe(-50);
  });

  it('enqueues on the offline path and returns true', async () => {
    const start = existingMovement();
    const { result } = renderGrainHook({ initial: [start], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement({ ...start, bushels: 800 });
    });

    expect(ok).toBe(true);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'grain_movements', 'update', expect.objectContaining({ id: start.id }), FARM,
    );
  });

  it('rolls back to previous when offline enqueue rejects', async () => {
    enqueueMutation.mockRejectedValueOnce(new Error('queue full'));
    const start = existingMovement({ bushels: 1000 });
    const { result } = renderGrainHook({ initial: [start], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement({ ...start, bushels: 800 });
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.grains.value[0].bushels).toBe(1000));
  });

  it('blocks a concurrent mutation while isMutating is held', async () => {
    // Drive supabase to a pending state by making the insert promise resolve late.
    supabaseMock.setResult({ data: null, error: null, count: null });
    const { result } = renderGrainHook();

    let first!: Promise<boolean>;
    act(() => { first = result.current.ops.addGrainMovement(addInput); });
    // While `first` is still pending, kick a second add — should be refused.
    let secondOk: boolean | undefined;
    await act(async () => { secondOk = await result.current.ops.addGrainMovement(addInput); });

    expect(secondOk).toBe(false);
    await act(async () => { await first; });
  });
});

// ---------------------------------------------------------------------------
describe('useGrainMovements — deleteGrainMovements', () => {
  it('deletes via .in(id).eq(farm_id) on online success', async () => {
    supabaseMock.setResult({ count: 2, data: null, error: null });
    const g1 = existingMovement({ id: 'g1' });
    const g2 = existingMovement({ id: 'g2' });
    const { result } = renderGrainHook({ initial: [g1, g2] });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteGrainMovements(['g1', 'g2']); });

    expect(ok).toBe(true);
    expect(supabaseMock.fns.in).toHaveBeenCalledWith('id', ['g1', 'g2']);
    expect(supabaseMock.fns.eq).toHaveBeenCalledWith('farm_id', FARM);
    await waitFor(() => expect(result.current.grains.value).toHaveLength(0));
  });

  it('restores records at original indices on count mismatch', async () => {
    supabaseMock.setResult({ count: 1, data: null, error: null }); // only 1 of 2 deleted
    const g1 = existingMovement({ id: 'g1', bushels: 10 });
    const g2 = existingMovement({ id: 'g2', bushels: 20 });
    const g3 = existingMovement({ id: 'g3', bushels: 30 });
    const { result } = renderGrainHook({ initial: [g1, g2, g3] });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteGrainMovements(['g1', 'g3']); });

    expect(ok).toBe(false);
    // Full snapshot restored in original order.
    await waitFor(() => {
      expect(result.current.grains.value.map(g => g.id)).toEqual(['g1', 'g2', 'g3']);
    });
  });

  it('uses atomic enqueueMutations on the offline path', async () => {
    const g1 = existingMovement({ id: 'g1' });
    const g2 = existingMovement({ id: 'g2' });
    const { result } = renderGrainHook({ initial: [g1, g2], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteGrainMovements(['g1', 'g2']); });

    expect(ok).toBe(true);
    expect(enqueueMutations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'grain_movements', operation: 'soft_delete' }),
        expect.objectContaining({ tableName: 'grain_movements', operation: 'soft_delete' }),
      ]),
    );
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('restores the full snapshot when the offline batch rejects', async () => {
    enqueueMutations.mockRejectedValueOnce(new Error('queue full'));
    const g1 = existingMovement({ id: 'g1' });
    const g2 = existingMovement({ id: 'g2' });
    const { result } = renderGrainHook({ initial: [g1, g2], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteGrainMovements(['g1', 'g2']); });

    expect(ok).toBe(false);
    await waitFor(() => {
      expect(result.current.grains.value.map(g => g.id)).toEqual(['g1', 'g2']);
    });
  });
});
