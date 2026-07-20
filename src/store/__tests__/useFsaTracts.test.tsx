/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import type { TractFeatureCollection } from '@/lib/tractLookup';
import { useStatefulArray } from '@/test/hookTestHarness';

// --- Mocks ----------------------------------------------------------------
// cluAssignmentService / fsaTractService are mocked as modules so per-test
// control of their resolve/reject is explicit (the hook delegates to them
// online). syncQueue is mocked so the offline path is reachable.
const cluAssignmentService = {
  saveAssignment: vi.fn(),
  removeAssignment: vi.fn(),
};
const fsaTractService = {
  importTract: vi.fn(),
  deleteTract: vi.fn(),
};
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();
const mapFsaTractToDb = vi.fn((t: FsaTractImport) => ({
  id: t.id, farm_id: t.farmId, tract_key: t.tractKey, filename: t.filename,
  feature_count: t.featureCount, geojson: t.geojson, imported_at: t.importedAt,
  deleted_at: t.deletedAt,
}));
const mapFieldCluAssignmentToDb = vi.fn((a: FieldCluAssignment) => ({
  id: a.id, farm_id: a.farmId, field_id: a.fieldId, tract_key: a.tractKey,
  clu_number: a.cluNumber, acres: a.acres, land_use: a.landUse,
  assigned_at: a.assignedAt, deleted_at: a.deletedAt,
}));
// From-db mappers round-trip the row back to the app type. The hook calls
// mapFieldCluAssignmentFromDb on the service result to replace the optimistic
// record with the persisted one, so these must return a real object.
const mapFieldCluAssignmentFromDb = vi.fn((row: unknown) => row as FieldCluAssignment);
const mapFsaTractFromDb = vi.fn((row: unknown) => row as FsaTractImport);

vi.doMock('@/services/cluAssignmentService', () => ({ cluAssignmentService }));
vi.doMock('@/services/fsaTractService', () => ({ fsaTractService }));
vi.doMock('@/lib/syncQueue', () => ({
  syncQueue: { enqueueMutation, enqueueMutations },
}));
vi.doMock('@/lib/mappers', () => ({
  mapFsaTractToDb,
  mapFieldCluAssignmentToDb,
  mapFsaTractFromDb,
  mapFieldCluAssignmentFromDb,
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useFsaTracts: (typeof import('../useFsaTracts'))['useFsaTracts'];
beforeAll(async () => {
  ({ useFsaTracts } = await import('../useFsaTracts'));
});

const FARM = 'farm-1';

const geojson: TractFeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[-93.5, 38.4], [-93.5, 38.5], [-93.4, 38.5], [-93.5, 38.4]]] },
    properties: { cluNumber: '10', acres: 40 },
  }],
};

function makeTract(overrides: Partial<FsaTractImport> = {}): FsaTractImport {
  return {
    id: 'tract-1',
    farmId: FARM,
    tractKey: 'TK1',
    filename: 'tract.geojson',
    featureCount: 1,
    geojson,
    importedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<FieldCluAssignment> = {}): FieldCluAssignment {
  return {
    id: 'a1',
    farmId: FARM,
    fieldId: 'f1',
    tractKey: 'TK1',
    cluNumber: '10',
    acres: 40,
    landUse: 'cropland',
    assignedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

interface RenderOpts {
  farm_id?: string | null;
  tracts?: FsaTractImport[];
  assignments?: FieldCluAssignment[];
  isOnline?: boolean;
}

function renderFsaHook(opts: RenderOpts = {}) {
  return renderHook(({ farm_id, tracts, assignments, isOnline }) => {
    const tractState = useStatefulArray<FsaTractImport>(tracts ?? []);
    const assignState = useStatefulArray<FieldCluAssignment>(assignments ?? []);
    const onMutation = vi.fn();
    const ops = useFsaTracts({
      farm_id,
      fsaTracts: tractState.value,
      cluAssignments: assignState.value,
      setFsaTracts: tractState.setValue,
      setCluAssignments: assignState.setValue,
      isOnline,
      onMutation,
    });
    return { tractState, assignState, ops, onMutation };
  }, {
    initialProps: {
      farm_id: opts.farm_id === undefined ? FARM : opts.farm_id,
      tracts: opts.tracts,
      assignments: opts.assignments,
      isOnline: opts.isOnline ?? true,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  enqueueMutation.mockReset();
  enqueueMutations.mockReset();
  enqueueMutation.mockResolvedValue(undefined);
  enqueueMutations.mockResolvedValue(undefined);
  mapFsaTractToDb.mockImplementation((t: FsaTractImport) => ({
    id: t.id, farm_id: t.farmId, tract_key: t.tractKey, filename: t.filename,
    feature_count: t.featureCount, geojson: t.geojson, imported_at: t.importedAt,
    deleted_at: t.deletedAt,
  }));
  mapFieldCluAssignmentToDb.mockImplementation((a: FieldCluAssignment) => ({
    id: a.id, farm_id: a.farmId, field_id: a.fieldId, tract_key: a.tractKey,
    clu_number: a.cluNumber, acres: a.acres, land_use: a.landUse,
    assigned_at: a.assignedAt, deleted_at: a.deletedAt,
  }));
  mapFieldCluAssignmentFromDb.mockImplementation((row: unknown) => row as FieldCluAssignment);
  mapFsaTractFromDb.mockImplementation((row: unknown) => row as FsaTractImport);
});

// ---------------------------------------------------------------------------
describe('useFsaTracts — assignClu', () => {
  it('rejects when farm_id is null', async () => {
    const { result } = renderFsaHook({ farm_id: null });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 40); });
    expect(ok).toBe(false);
    expect(cluAssignmentService.saveAssignment).not.toHaveBeenCalled();
  });

  it('rejects acres <= 0 (positive-acreage rule)', async () => {
    const { result } = renderFsaHook();
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 0); });
    expect(ok).toBe(false);
    expect(cluAssignmentService.saveAssignment).not.toHaveBeenCalled();
    expect(result.current.assignState.value).toHaveLength(0);
  });

  it('creates a new assignment (fresh UUID) on online success', async () => {
    cluAssignmentService.saveAssignment.mockResolvedValue({ data: makeAssignment({ id: 'new-id' }), error: null });
    const { result } = renderFsaHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 40); });

    expect(ok).toBe(true);
    expect(result.current.assignState.value).toHaveLength(1);
    expect(result.current.assignState.value[0]).toMatchObject({
      fieldId: 'f1', tractKey: 'TK1', cluNumber: '10', acres: 40, deletedAt: null,
    });
  });

  it('reuses the existing assignment id when reassigning (restore-by-conflict-key)', async () => {
    // A soft-deleted prior assignment for the same tract/clu exists. Reassign
    // must reuse its id rather than mint a new UUID — that id is what makes the
    // service-level upsert restore the soft-deleted row by conflict key.
    const existing = makeAssignment({ id: 'original-id', deletedAt: '2026-01-01T00:00:00.000Z' });
    cluAssignmentService.saveAssignment.mockResolvedValue({ data: makeAssignment({ id: 'original-id' }), error: null });
    const { result } = renderFsaHook({ assignments: [existing] });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 40); });

    expect(ok).toBe(true);
    expect(cluAssignmentService.saveAssignment).toHaveBeenCalledWith(
      'original-id', 'f1', 'TK1', '10', 40, 'cropland', FARM,
    );
    // The restored assignment is active (deletedAt null) and keeps its id.
    expect(result.current.assignState.value[0].id).toBe('original-id');
    expect(result.current.assignState.value[0].deletedAt).toBeNull();
  });

  it('rolls back when the online service returns an error', async () => {
    cluAssignmentService.saveAssignment.mockResolvedValue({ data: null, error: { message: 'conflict' } });
    const { result } = renderFsaHook();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 40); });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.assignState.value).toHaveLength(0));
  });

  it('enqueues on the offline path and returns true', async () => {
    const { result } = renderFsaHook({ isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 40); });

    expect(ok).toBe(true);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'field_clu_assignments', 'insert', expect.objectContaining({ field_id: 'f1' }), FARM,
    );
  });

  it('rolls back when offline enqueue rejects', async () => {
    enqueueMutation.mockRejectedValueOnce(new Error('queue full'));
    const { result } = renderFsaHook({ isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.assignClu('f1', 'TK1', '10', 40); });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.assignState.value).toHaveLength(0));
  });
});

// ---------------------------------------------------------------------------
describe('useFsaTracts — deleteTract (corrected cascade)', () => {
  it('online: calls fsaTractService.deleteTract RPC and does NOT enqueue assignments', async () => {
    fsaTractService.deleteTract.mockResolvedValue({ data: true, error: null });
    const tract = makeTract();
    const a1 = makeAssignment({ id: 'a1', tractKey: 'TK1' });
    const { result } = renderFsaHook({ tracts: [tract], assignments: [a1] });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteTract(tract.id); });

    expect(ok).toBe(true);
    expect(fsaTractService.deleteTract).toHaveBeenCalledWith(tract.id, FARM);
    // Online path uses the RPC; no assignment enqueue.
    expect(enqueueMutation).not.toHaveBeenCalled();
    expect(enqueueMutations).not.toHaveBeenCalled();
    // CLU state was optimistically filtered.
    await waitFor(() => expect(result.current.assignState.value).toHaveLength(0));
  });

  it('online: rolls back both tracts and assignments when the RPC fails', async () => {
    fsaTractService.deleteTract.mockResolvedValue({ data: false, error: { message: 'rpc failed' } });
    const tract = makeTract();
    const a1 = makeAssignment({ id: 'a1', tractKey: 'TK1' });
    const { result } = renderFsaHook({ tracts: [tract], assignments: [a1] });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteTract(tract.id); });

    expect(ok).toBe(false);
    await waitFor(() => {
      expect(result.current.tractState.value).toHaveLength(1);
      expect(result.current.assignState.value).toHaveLength(1);
    });
  });

  it('online: rolls back both collections when the RPC rejects unexpectedly', async () => {
    fsaTractService.deleteTract.mockRejectedValue(new Error('network'));
    const tract = makeTract();
    const a1 = makeAssignment({ id: 'a1', tractKey: 'TK1' });
    const { result } = renderFsaHook({ tracts: [tract], assignments: [a1] });

    await act(async () => expect(await result.current.ops.deleteTract(tract.id)).toBe(false));

    expect(result.current.tractState.value).toEqual([tract]);
    expect(result.current.assignState.value).toEqual([a1]);
  });

  it('offline: enqueues tract + assignment cascade atomically via enqueueMutations', async () => {
    const tract = makeTract();
    const a1 = makeAssignment({ id: 'a1', tractKey: 'TK1' });
    const a2 = makeAssignment({ id: 'a2', tractKey: 'TK1' });
    const { result } = renderFsaHook({ tracts: [tract], assignments: [a1, a2], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteTract(tract.id); });

    expect(ok).toBe(true);
    expect(enqueueMutations).toHaveBeenCalledTimes(1);
    const batch = enqueueMutations.mock.calls[0][0] as { tableName: string }[];
    expect(batch.map(b => b.tableName)).toEqual(
      expect.arrayContaining(['fsa_tract_imports', 'field_clu_assignments', 'field_clu_assignments']),
    );
    // Atomic batch, not a per-row loop.
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('offline: rolls back both tracts and assignments when the batch rejects', async () => {
    enqueueMutations.mockRejectedValueOnce(new Error('queue full'));
    const tract = makeTract();
    const a1 = makeAssignment({ id: 'a1', tractKey: 'TK1' });
    const { result } = renderFsaHook({ tracts: [tract], assignments: [a1], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.deleteTract(tract.id); });

    expect(ok).toBe(false);
    await waitFor(() => {
      expect(result.current.tractState.value).toHaveLength(1);
      expect(result.current.assignState.value).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe('useFsaTracts — unassignAllClusForField (field-deletion cascade target)', () => {
  it('online: soft-deletes each field assignment via the service loop', async () => {
    cluAssignmentService.removeAssignment.mockResolvedValue({ count: 1, error: null });
    const a1 = makeAssignment({ id: 'a1', fieldId: 'f1' });
    const a2 = makeAssignment({ id: 'a2', fieldId: 'f1' });
    const other = makeAssignment({ id: 'a3', fieldId: 'f2' });
    const { result } = renderFsaHook({ assignments: [a1, a2, other] });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.unassignAllClusForField('f1'); });

    expect(ok).toBe(true);
    expect(cluAssignmentService.removeAssignment).toHaveBeenCalledTimes(2);
    // Only f1 assignments were marked deleted; f2 untouched.
    await waitFor(() => {
      const f1 = result.current.assignState.value.filter(a => a.fieldId === 'f1');
      expect(f1.every(a => a.deletedAt !== null)).toBe(true);
      const f2 = result.current.assignState.value.filter(a => a.fieldId === 'f2');
      expect(f2.every(a => a.deletedAt === null)).toBe(true);
    });
  });

  it('offline: enqueues the field assignments atomically', async () => {
    const a1 = makeAssignment({ id: 'a1', fieldId: 'f1' });
    const a2 = makeAssignment({ id: 'a2', fieldId: 'f1' });
    const { result } = renderFsaHook({ assignments: [a1, a2], isOnline: false });

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.ops.unassignAllClusForField('f1'); });

    expect(ok).toBe(true);
    expect(enqueueMutations).toHaveBeenCalledTimes(1);
    const batch = enqueueMutations.mock.calls[0][0] as { tableName: string; payload: { id: string } }[];
    expect(batch).toHaveLength(2);
    expect(batch.map(b => b.payload.id)).toEqual(expect.arrayContaining(['a1', 'a2']));
  });
});

// ---------------------------------------------------------------------------
describe('useFsaTracts — importTract', () => {
  it('online: delegates to fsaTractService.importTract', async () => {
    fsaTractService.importTract.mockResolvedValue({ data: makeTract({ id: 't1' }), error: null });
    const { result } = renderFsaHook();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.importTract('TK1', 'tract.geojson', geojson, 1);
    });

    expect(ok).toBe(true);
    expect(fsaTractService.importTract).toHaveBeenCalledWith(
      expect.any(String), 'TK1', 'tract.geojson', geojson, 1, FARM,
    );
    expect(result.current.tractState.value).toHaveLength(1);
  });

  it('rolls back when the online service returns an error', async () => {
    fsaTractService.importTract.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const { result } = renderFsaHook();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.importTract('TK1', 'tract.geojson', geojson, 1);
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.tractState.value).toHaveLength(0));
  });

  it('rolls back when the online service rejects unexpectedly', async () => {
    fsaTractService.importTract.mockRejectedValue(new Error('network'));
    const { result } = renderFsaHook();

    await act(async () => {
      expect(await result.current.ops.importTract('TK1', 'tract.geojson', geojson, 1)).toBe(false);
    });

    expect(result.current.tractState.value).toEqual([]);
  });

  it('enqueues on the offline path', async () => {
    const { result } = renderFsaHook({ isOnline: false });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.importTract('TK1', 'tract.geojson', geojson, 1);
    });

    expect(ok).toBe(true);
    expect(enqueueMutation).toHaveBeenCalledWith(
      'fsa_tract_imports', 'insert', expect.objectContaining({ tract_key: 'TK1' }), FARM,
    );
  });
});
