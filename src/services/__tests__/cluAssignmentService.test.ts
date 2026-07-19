import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

// Consumer pattern: one mock per suite, vi.doMock, dynamic import of the SUT.
// The SUT receives `mock.client` as its `supabase`. reset() in beforeEach keeps
// tests isolated (it re-installs implementations after mockReset).
const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));

let svc: typeof import('../cluAssignmentService');
beforeAll(async () => {
  svc = await import('../cluAssignmentService');
});

describe('cluAssignmentService', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('updates land use with exact row counts and no returning select', async () => {
    mock.setResult({ count: 1, data: null, error: null });

    const result = await svc.cluAssignmentService.updateLandUse('assignment-1', 'cropland', 'farm-1');

    expect(mock.fns.from).toHaveBeenCalledWith('field_clu_assignments');
    expect(mock.fns.update).toHaveBeenCalledWith({ land_use: 'cropland' }, { count: 'exact' });
    expect(mock.fns.eq).toHaveBeenNthCalledWith(1, 'id', 'assignment-1');
    expect(mock.fns.eq).toHaveBeenNthCalledWith(2, 'farm_id', 'farm-1');
    expect(mock.fns.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mock.fns.select).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  it('soft deletes assignments with exact row counts and no returning select', async () => {
    const deletedAt = '2026-07-02T02:30:00.000Z';
    mock.setResult({ count: 1, data: null, error: null });

    const result = await svc.cluAssignmentService.removeAssignment('assignment-1', 'farm-1', deletedAt);

    expect(mock.fns.from).toHaveBeenCalledWith('field_clu_assignments');
    expect(mock.fns.update).toHaveBeenCalledWith({ deleted_at: deletedAt }, { count: 'exact' });
    expect(mock.fns.eq).toHaveBeenNthCalledWith(1, 'id', 'assignment-1');
    expect(mock.fns.eq).toHaveBeenNthCalledWith(2, 'farm_id', 'farm-1');
    expect(mock.fns.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mock.fns.select).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  it('saveAssignment upserts on the sanctioned farm/tract/clu conflict key then selects single', async () => {
    mock.setResult({ data: { id: 'a1' }, error: null, count: null });

    await svc.cluAssignmentService.saveAssignment(
      'a1', 'field-1', 'tract-1', '10', 40.5, 'cropland', 'farm-1',
    );

    // The conflict key is the load-bearing invariant: reassigning a CLU must
    // restore a soft-deleted row by key rather than colliding. Do not regress
    // this to a plain insert.
    expect(mock.fns.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a1',
        farm_id: 'farm-1',
        field_id: 'field-1',
        tract_key: 'tract-1',
        clu_number: '10',
        acres: 40.5,
        land_use: 'cropland',
        deleted_at: null,
      }),
      { onConflict: 'farm_id,tract_key,clu_number' },
    );
    expect(mock.fns.select).toHaveBeenCalledWith();
    expect(mock.fns.single).toHaveBeenCalledWith();
  });

  it('fetchAssignmentsForFarm selects active rows scoped to the farm', async () => {
    mock.setResult({ data: [], error: null, count: null });

    await svc.cluAssignmentService.fetchAssignmentsForFarm('farm-1');

    expect(mock.fns.from).toHaveBeenCalledWith('field_clu_assignments');
    expect(mock.fns.select).toHaveBeenCalledWith('*');
    expect(mock.fns.eq).toHaveBeenCalledWith('farm_id', 'farm-1');
    expect(mock.fns.is).toHaveBeenCalledWith('deleted_at', null);
  });
});
