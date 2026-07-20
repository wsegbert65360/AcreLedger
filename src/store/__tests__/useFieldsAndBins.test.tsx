/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin, Field, FertilizerRecipe, SavedSeed, SprayRecipe } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { useStatefulArray } from '@/test/hookTestHarness';

const fieldService = {
  createField: vi.fn(), updateField: vi.fn(), softDeleteField: vi.fn(),
};
const binService = {
  createBin: vi.fn(), updateBin: vi.fn(), softDeleteBin: vi.fn(),
};
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();

vi.doMock('@/services/fieldService', () => ({ fieldService }));
vi.doMock('@/services/binService', () => ({ binService }));
vi.doMock('@/lib/syncQueue', () => ({ syncQueue: { enqueueMutation, enqueueMutations } }));
vi.doMock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.doMock('@/lib/mappers', () => ({
  mapFieldToDb: vi.fn((value: Field) => ({ ...value })),
  mapBinToDb: vi.fn((value: Bin) => ({ ...value })),
  mapSeedToDb: vi.fn((value: unknown) => value),
  mapRecipeToDb: vi.fn((value: unknown) => value),
  mapFertilizerRecipeToDb: vi.fn((value: unknown) => value),
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useFieldsAndBins: (typeof import('../useFieldsAndBins'))['useFieldsAndBins'];
beforeAll(async () => ({ useFieldsAndBins } = await import('../useFieldsAndBins')));

const field = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1', farm_id: 'farm-1', name: 'North 40', acreage: 40,
  crop: 'Corn', deleted_at: null, ...overrides,
} as Field);
const bin = (overrides: Partial<Bin> = {}): Bin => ({
  id: 'bin-1', farm_id: 'farm-1', name: 'Bin 1', capacity: 10000,
  deleted_at: null, ...overrides,
} as Bin);
const assignment = (): FieldCluAssignment => ({
  id: 'clu-1', farmId: 'farm-1', fieldId: 'field-1', tractKey: 'T1',
  cluNumber: '1', acres: 40, landUse: 'cropland', assignedAt: '2026-01-01', deletedAt: null,
});

function renderStore(options: { online?: boolean; fields?: Field[]; bins?: Bin[]; assignments?: FieldCluAssignment[] } = {}) {
  return renderHook(() => {
    const fields = useStatefulArray(options.fields ?? [field()]);
    const bins = useStatefulArray(options.bins ?? [bin()]);
    const assignments = useStatefulArray(options.assignments ?? [assignment()]);
    const seeds = useStatefulArray<SavedSeed>([]);
    const sprayRecipes = useStatefulArray<SprayRecipe>([]);
    const fertilizerRecipes = useStatefulArray<FertilizerRecipe>([]);
    const ops = useFieldsAndBins({
      farm_id: 'farm-1', fields: fields.value, bins: bins.value,
      savedSeeds: seeds.value, sprayRecipes: sprayRecipes.value,
      fertilizerRecipes: fertilizerRecipes.value, cluAssignments: assignments.value,
      setFields: fields.setValue, setBins: bins.setValue, setSavedSeeds: seeds.setValue,
      setSprayRecipes: sprayRecipes.setValue,
      setFertilizerRecipes: fertilizerRecipes.setValue,
      setCluAssignments: assignments.setValue,
      isOnline: options.online ?? true, onMutation: vi.fn(),
    });
    return { ops, fields, bins, assignments };
  });
}

describe('useFieldsAndBins safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueMutation.mockResolvedValue(undefined);
    enqueueMutations.mockResolvedValue(undefined);
    fieldService.updateField.mockResolvedValue({ count: 1, error: null });
    fieldService.softDeleteField.mockResolvedValue({ count: 1, error: null });
    binService.updateBin.mockResolvedValue({ count: 1, error: null });
  });

  it('keeps an online field update when exactly one row changes', async () => {
    const { result } = renderStore();
    await act(async () => expect(await result.current.ops.updateField(field({ name: 'Updated' }))).toBe(true));
    expect(result.current.fields.value[0].name).toBe('Updated');
  });

  it('restores the closure snapshot when an online field update affects zero rows', async () => {
    fieldService.updateField.mockResolvedValue({ count: 0, error: null });
    const { result } = renderStore();
    await act(async () => expect(await result.current.ops.updateField(field({ name: 'Lost' }))).toBe(false));
    expect(result.current.fields.value[0].name).toBe('North 40');
  });

  it('restores a field when offline queue persistence rejects', async () => {
    enqueueMutation.mockRejectedValue(new Error('storage full'));
    const { result } = renderStore({ online: false });
    await act(async () => expect(await result.current.ops.updateField(field({ name: 'Lost' }))).toBe(false));
    expect(result.current.fields.value[0].name).toBe('North 40');
  });

  it('queues field and active CLU deletes in one batch', async () => {
    const { result } = renderStore({ online: false });
    await act(async () => expect(await result.current.ops.deleteField('field-1')).toBe(true));
    expect(enqueueMutations).toHaveBeenCalledTimes(1);
    expect(enqueueMutations.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableName: 'fields' }),
      expect.objectContaining({ tableName: 'field_clu_assignments' }),
    ]));
    expect(enqueueMutations.mock.calls[0][0].map((item: { tableName: string }) => item.tableName))
      .toEqual(['field_clu_assignments', 'fields']);
    expect(result.current.fields.value[0].deleted_at).not.toBeNull();
    expect(result.current.assignments.value[0].deletedAt).not.toBeNull();
  });

  it('rolls back both field and CLU state when the offline batch rejects', async () => {
    enqueueMutations.mockRejectedValue(new Error('storage full'));
    const { result } = renderStore({ online: false });
    await act(async () => expect(await result.current.ops.deleteField('field-1')).toBe(false));
    expect(result.current.fields.value[0].deleted_at).toBeNull();
    expect(result.current.assignments.value[0].deletedAt).toBeNull();
  });

  it('rolls back field and assignment state when the atomic online delete fails', async () => {
    fieldService.softDeleteField.mockResolvedValue({ count: 0, error: null });
    const { result } = renderStore();
    await act(async () => expect(await result.current.ops.deleteField('field-1')).toBe(false));
    expect(result.current.fields.value[0].deleted_at).toBeNull();
    expect(result.current.assignments.value[0].deletedAt).toBeNull();
  });

  it('keeps field and assignment state deleted after the atomic online RPC succeeds', async () => {
    const { result } = renderStore();
    await act(async () => expect(await result.current.ops.deleteField('field-1')).toBe(true));
    expect(result.current.fields.value[0].deleted_at).not.toBeNull();
    expect(result.current.assignments.value[0].deletedAt).not.toBeNull();
  });

  it('rolls back field and assignment state when the atomic RPC rejects', async () => {
    fieldService.softDeleteField.mockRejectedValue(new Error('network'));
    const { result } = renderStore();
    await act(async () => expect(await result.current.ops.deleteField('field-1')).toBe(false));
    expect(result.current.fields.value[0].deleted_at).toBeNull();
    expect(result.current.assignments.value[0].deletedAt).toBeNull();
  });

  it('restores the prior bin when its online update fails', async () => {
    binService.updateBin.mockResolvedValue({ count: 0, error: null });
    const { result } = renderStore();
    await act(async () => expect(await result.current.ops.updateBin(bin({ name: 'Lost' }))).toBe(false));
    expect(result.current.bins.value[0].name).toBe('Bin 1');
  });
});
