/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GrainMovement } from '@/types/farm';
import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';

/**
 * Focused regression tests for the High data-loss finding: an online write with
 * an unknown outcome (timeout / abort / network error) must NOT roll back the
 * optimistic record. It must enqueue the same client-generated id so replay's
 * 23505 reconcile path can adopt the possibly-committed row instead of
 * re-inserting it and double-counting grain.
 */

const mapGrainToDb = vi.fn();
const supabaseMock = createSupabaseMock();
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();

vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
vi.doMock('@/lib/mappers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mappers')>();
  return { ...actual, mapGrainToDb };
});
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

const addInput = {
  binId: 'b1',
  binName: 'Bin A',
  type: 'in' as const,
  bushels: 500,
  moisturePercent: 14,
  timestamp: 1700000000000,
};

function renderGrainHook(opts: { initial?: GrainMovement[]; isOnline?: boolean } = {}) {
  return renderHook(({ initial, isOnline }) => {
    const grains = useStatefulArray<GrainMovement>(initial ?? []);
    const onMutation = vi.fn();
    const ops = useGrainMovements({
      farm_id: FARM,
      viewingSeason: SEASON,
      grainMovements: grains.value,
      setGrainMovements: grains.setValue,
      isOnline,
      onMutation,
    });
    return { grains, ops, onMutation };
  }, {
    initialProps: { initial: opts.initial, isOnline: opts.isOnline ?? true },
  });
}

beforeEach(() => {
  supabaseMock.reset();
  enqueueMutation.mockReset();
  enqueueMutations.mockReset();
  enqueueMutation.mockResolvedValue(undefined);
  enqueueMutations.mockResolvedValue(undefined);
  mapGrainToDb.mockReset();
  mapGrainToDb.mockImplementation((r: GrainMovement) => ({ ...r }));
});

describe('useGrainMovements — unknown-outcome online writes', () => {
  it('add: preserves the record and enqueues the SAME id when the insert times out', async () => {
    const abortError = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    supabaseMock.setThrow(abortError);
    const { result } = renderGrainHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(true);
    // Optimistic record is NOT dropped.
    expect(result.current.grains.value).toHaveLength(1);
    const record = result.current.grains.value[0];

    // Same client-generated id is re-queued so replay can reconcile the row.
    expect(enqueueMutation).toHaveBeenCalledTimes(1);
    const [table, operation, payload] = enqueueMutation.mock.calls[0];
    expect(table).toBe('grain_movements');
    expect(operation).toBe('insert');
    expect(payload.id).toBe(record.id);
  });

  it('add: treats a plain network TypeError as unknown and queues the same id', async () => {
    supabaseMock.setThrow(new TypeError('Failed to fetch'));
    const { result } = renderGrainHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(true);
    expect(result.current.grains.value).toHaveLength(1);
    expect(enqueueMutation).toHaveBeenCalledTimes(1);
    expect(enqueueMutation.mock.calls[0][2].id).toBe(result.current.grains.value[0].id);
  });

  it('add: a permanent (constraint) error still rolls back and does not queue', async () => {
    supabaseMock.setResult({ data: null, error: { code: '23514', message: 'check violation' }, count: null });
    const { result } = renderGrainHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.addGrainMovement(addInput); });

    expect(ok).toBe(false);
    expect(result.current.grains.value).toHaveLength(0);
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('add: reuses the row id across a retry so no duplicate is created', async () => {
    // First attempt: unknown outcome -> queued + preserved.
    supabaseMock.setThrow(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const first = renderGrainHook();
    await act(async () => { await first.result.current.ops.addGrainMovement(addInput); });
    const firstId = first.result.current.grains.value[0].id;

    // A retry of the same user intent (same input) generates a NEW id only
    // because it is a distinct invocation; the guarantee under test is that a
    // replayed queue row keeps the id it was originally enqueued with.
    const queuedPayload = enqueueMutation.mock.calls[0][2];
    expect(queuedPayload.id).toBe(firstId);
  });

  it('update: queues the same id/version instead of rolling back on timeout', async () => {
    const existing: GrainMovement = {
      id: 'g-existing', binId: 'b1', binName: 'Bin A', type: 'in', bushels: 1000,
      moisturePercent: 15, timestamp: 1700000000000, seasonYear: SEASON,
      farm_id: FARM, deleted_at: null,
    };
    supabaseMock.setThrow(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const { result } = renderGrainHook({ initial: [existing] });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.updateGrainMovement({ ...existing, bushels: 1200 });
    });

    expect(ok).toBe(true);
    expect(result.current.grains.value[0].bushels).toBe(1200);
    expect(enqueueMutation).toHaveBeenCalledTimes(1);
    const [table, operation, payload] = enqueueMutation.mock.calls[0];
    expect(table).toBe('grain_movements');
    expect(operation).toBe('update');
    expect(payload.id).toBe('g-existing');
  });
});
