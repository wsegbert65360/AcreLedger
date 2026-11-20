/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Field } from '@/types/farm';
import type { CountyAssignment } from '@/lib/county/types';
import { ACROSS_LINE, BENTON, COUNTIES, HENRY, IN_HENRY, row } from '@/lib/county/__tests__/fixtures';
import { collectCountySubjects } from '@/lib/county/plan';
import { useStatefulArray } from '@/test/hookTestHarness';

const { enqueueMutations, replayQueue, loadCountiesFor } = vi.hoisted(() => ({
  enqueueMutations: vi.fn(),
  replayQueue: vi.fn(),
  loadCountiesFor: vi.fn(),
}));

vi.mock('@/lib/syncQueue', () => ({ syncQueue: { enqueueMutations, replayQueue } }));
vi.mock('@/lib/county/boundaryProvider', () => ({ loadCountiesFor }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useCountyAssignments } from '../useCountyAssignments';

const field = (over: Partial<Field> = {}): Field => ({
  id: 'field-1', name: 'Home', acreage: 55, lat: null, lng: null, farm_id: 'farm-a', boundary: ACROSS_LINE, ...over,
} as Field);

function setup(opts: { fields?: Field[]; existing?: CountyAssignment[]; isOnline?: boolean; ready?: boolean } = {}) {
  return renderHook(() => {
    const county = useStatefulArray<CountyAssignment>(opts.existing ?? []);
    const ops = useCountyAssignments({
      farm_id: 'farm-a', userId: 'user-1', fields: opts.fields ?? [field()], fsaTracts: [], cluAssignments: [],
      countyAssignments: county.value, setCountyAssignments: county.setValue,
      isOnline: opts.isOnline ?? true, ready: opts.ready ?? false, onMutation: vi.fn(),
    });
    return { county, ops };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  enqueueMutations.mockResolvedValue(undefined);
  replayQueue.mockResolvedValue(true);
  loadCountiesFor.mockResolvedValue({ counties: COUNTIES, reason: null });
});

describe('useCountyAssignments', () => {
  it('previews without writing anything', async () => {
    const { result } = setup();
    let preview: Awaited<ReturnType<typeof result.current.ops.previewCounties>> | undefined;
    await act(async () => { preview = await result.current.ops.previewCounties('sync'); });
    expect(preview?.plan?.upserts).toHaveLength(2);
    expect(enqueueMutations).not.toHaveBeenCalled();
    expect(result.current.county.value).toHaveLength(0);
  });

  it('applies a plan as one durable batch, retire first, and mirrors it into local state', async () => {
    const stale = row({ id: 'stale', subjectKey: 'field-1', countyFips: '29999', countyName: 'Gone' });
    const { result } = setup({ existing: [stale] });
    await act(async () => { await result.current.ops.recalculateCounties('recalculate'); });
    expect(enqueueMutations).toHaveBeenCalledTimes(1);
    const batch = enqueueMutations.mock.calls[0][0] as { tableName: string; operation: string; payload: { id: string; farm_id?: string } }[];
    expect(batch.every(m => m.tableName === 'county_assignments')).toBe(true);
    expect(batch[0]).toMatchObject({ operation: 'soft_delete', payload: { id: 'stale' } });
    expect(batch.slice(1).every(m => m.operation === 'insert' && m.payload.farm_id === 'farm-a')).toBe(true);
    expect(result.current.county.value.map(r => r.countyFips).sort()).toEqual(['29015', '29083']);
    expect(replayQueue).toHaveBeenCalledWith('farm-a');
  });

  it('works offline: saved to the queue and local state, no replay attempted', async () => {
    const { result } = setup({ isOnline: false });
    await act(async () => { await result.current.ops.recalculateCounties('sync'); });
    expect(enqueueMutations).toHaveBeenCalled();
    expect(replayQueue).not.toHaveBeenCalled();
    expect(result.current.county.value).toHaveLength(2);
  });

  it('writes nothing when boundaries are not available, and says why', async () => {
    loadCountiesFor.mockResolvedValue({ counties: null, reason: 'County boundaries are not downloaded for this area yet' });
    const { result } = setup({ isOnline: false });
    let out: Awaited<ReturnType<typeof result.current.ops.recalculateCounties>> | undefined;
    await act(async () => { out = await result.current.ops.recalculateCounties('sync'); });
    expect(out?.unavailableReason).toMatch(/not downloaded/);
    expect(enqueueMutations).not.toHaveBeenCalled();
    expect(result.current.county.value).toHaveLength(0);
  });

  it('does not report success or change state when the queue write fails', async () => {
    enqueueMutations.mockRejectedValue(new Error('QuotaExceededError'));
    const { result } = setup();
    let out: Awaited<ReturnType<typeof result.current.ops.recalculateCounties>> | undefined;
    await act(async () => { out = await result.current.ops.recalculateCounties('sync'); });
    expect(out?.applied).toBe(false);
    expect(result.current.county.value).toHaveLength(0);
  });

  it('never touches another farm\'s rows', async () => {
    const other = row({ id: 'other', farmId: 'farm-b', subjectKey: 'field-1', countyFips: '29999' });
    const { result } = setup({ existing: [other] });
    await act(async () => { await result.current.ops.recalculateCounties('recalculate'); });
    const batch = enqueueMutations.mock.calls[0][0] as { operation: string; payload: { id: string } }[];
    expect(batch.some(m => m.payload.id === 'other')).toBe(false);
    expect(result.current.county.value.some(r => r.id === 'other')).toBe(true);
  });

  it('is repeatable: a second sync adds no duplicates and enqueues nothing', async () => {
    const { result } = setup();
    await act(async () => { await result.current.ops.recalculateCounties('sync'); });
    enqueueMutations.mockClear();
    await act(async () => { await result.current.ops.recalculateCounties('sync'); });
    expect(enqueueMutations).not.toHaveBeenCalled();
    expect(result.current.county.value).toHaveLength(2);
  });

  it('saves a valid manual split and rejects one that does not match the recorded acreage', async () => {
    const { result } = setup();
    const subject = collectCountySubjects({ fields: [field()], tractCollections: [] }).subjects[0];
    let bad: { ok: boolean; errors: string[] } | undefined;
    await act(async () => { bad = await result.current.ops.saveManualSplit({ subject, split: [{ county: HENRY, acres: 40 }] }); });
    expect(bad?.ok).toBe(false);
    expect(enqueueMutations).not.toHaveBeenCalled();
    let good: { ok: boolean } | undefined;
    await act(async () => { good = await result.current.ops.saveManualSplit({ subject, split: [{ county: HENRY, acres: 10 }, { county: BENTON, acres: 45 }] }); });
    expect(good?.ok).toBe(true);
    expect(result.current.county.value.every(r => r.method === 'manual')).toBe(true);
    expect(result.current.county.value.map(r => r.manualAcres).sort()).toEqual([10, 45]);
  });

  it('keeps a manual correction through a full recalculation, then restores automatic on request', async () => {
    const { result } = setup();
    const subject = collectCountySubjects({ fields: [field()], tractCollections: [] }).subjects[0];
    await act(async () => { await result.current.ops.saveManualSplit({ subject, split: [{ county: HENRY, acres: 10 }, { county: BENTON, acres: 45 }] }); });
    await act(async () => { await result.current.ops.recalculateCounties('recalculate'); });
    expect(result.current.county.value.every(r => r.method === 'manual')).toBe(true);
    await act(async () => { await result.current.ops.restoreAutomatic(subject); });
    expect(result.current.county.value.length).toBeGreaterThan(0);
    expect(result.current.county.value.every(r => r.method === 'geometry')).toBe(true);
  });

  it('does not backfill on its own: an existing farm with no county rows waits for the reviewed backfill', async () => {
    setup({ ready: true });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(enqueueMutations).not.toHaveBeenCalled();
  });

  it('keeps a farm that has county rows current once it is ready', async () => {
    const existing = row({ id: 'x', subjectKey: 'field-1', fieldId: 'field-1', geometryHash: 'g1:old', countyFips: '29083' });
    const { result } = setup({ ready: true, existing: [existing], fields: [field({ boundary: IN_HENRY, acreage: 10 })] });
    await waitFor(() => expect(enqueueMutations).toHaveBeenCalled());
    expect(result.current.county.value.some(r => r.countyFips === '29083' && r.geometryHash !== 'g1:old')).toBe(true);
  });
});
