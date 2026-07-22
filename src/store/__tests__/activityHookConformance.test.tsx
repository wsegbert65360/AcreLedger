/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';

const cloud = createSupabaseMock();
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();
const toastError = vi.fn();

// Mapper handles are module-level so the mapper/season seam can be asserted:
// each hook must call its mapper, and the record handed to it must carry the
// viewingSeason stamp. (App→DB conversion itself is covered by mappers tests.)
const mapperMocks = {
  plant: vi.fn((v: unknown) => v),
  spray: vi.fn((v: unknown) => v),
  harvest: vi.fn((v: unknown) => v),
  hay: vi.fn((v: unknown) => v),
  customSpray: vi.fn((v: unknown) => v),
  tillage: vi.fn((v: unknown) => v),
  fertilizer: vi.fn((v: unknown) => v),
};

vi.doMock('@/lib/supabase', () => ({ supabase: cloud.client }));
vi.doMock('@/lib/syncQueue', () => ({ syncQueue: { enqueueMutation, enqueueMutations } }));
vi.doMock('@/lib/mappers', () => ({
  mapPlantToDb: mapperMocks.plant,
  mapSprayToDb: mapperMocks.spray,
  mapHarvestToDb: mapperMocks.harvest,
  mapHayToDb: mapperMocks.hay,
  mapCustomSprayToDb: mapperMocks.customSpray,
  mapTillageToDb: mapperMocks.tillage,
  mapFertilizerToDb: mapperMocks.fertilizer,
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));

interface Config {
  name: string;
  mapper: keyof typeof mapperMocks;
  addKey: string;
  addInput: Record<string, unknown>;
  useHook: (args: any) => any;
  recordsKey: string;
  setterKey: string;
  updateKey: string;
  deleteKey: string;
  table: string;
}

let configs: Config[];
beforeAll(async () => {
  const [plant, spray, harvest, hay, custom, tillage, fertilizer] = await Promise.all([
    import('../usePlantRecords'), import('../useSprayRecords'), import('../useHarvestRecords'),
    import('../useHayRecords'), import('../useCustomSprayRecords'), import('../useTillageRecords'),
    import('../useFertilizerRecords'),
  ]);
  configs = [
    { name: 'plant', mapper: 'plant', addKey: 'addPlantRecord', addInput: { fieldId: 'field-1', fieldName: 'North 40', seedVariety: 'P1197', acreage: 80, crop: 'Corn' }, useHook: plant.usePlantRecords, recordsKey: 'plantRecords', setterKey: 'setPlantRecords', updateKey: 'updatePlantRecord', deleteKey: 'deletePlantRecords', table: 'plant_records' },
    { name: 'spray', mapper: 'spray', addKey: 'addSprayRecord', addInput: { fieldId: 'field-1', fieldName: 'North 40', windSpeed: 5, temperature: 75, products: [] }, useHook: spray.useSprayRecords, recordsKey: 'sprayRecords', setterKey: 'setSprayRecords', updateKey: 'updateSprayRecord', deleteKey: 'deleteSprayRecords', table: 'spray_records' },
    { name: 'harvest', mapper: 'harvest', addKey: 'addHarvestRecord', addInput: { fieldId: 'field-1', fieldName: 'North 40', crop: 'Corn', bushels: 4000, harvestDate: '2026-10-01', moisturePercent: 15 }, useHook: harvest.useHarvestRecords, recordsKey: 'harvestRecords', setterKey: 'setHarvestRecords', updateKey: 'updateHarvestRecord', deleteKey: 'deleteHarvestRecords', table: 'harvest_records' },
    { name: 'hay', mapper: 'hay', addKey: 'addHayHarvestRecord', addInput: { fieldId: 'field-1', fieldName: 'North 40', baleCount: 10 }, useHook: hay.useHayRecords, recordsKey: 'hayHarvestRecords', setterKey: 'setHayHarvestRecords', updateKey: 'updateHayHarvestRecord', deleteKey: 'deleteHayHarvestRecords', table: 'hay_harvest_records' },
    { name: 'custom spray', mapper: 'customSpray', addKey: 'addCustomSprayRecord', addInput: { fieldId: 'field-1', fieldName: 'North 40', applicator: 'Co-op Applicator', date: '2026-05-01', applicationTime: '08:00' }, useHook: custom.useCustomSprayRecords, recordsKey: 'customSprayRecords', setterKey: 'setCustomSprayRecords', updateKey: 'updateCustomSprayRecord', deleteKey: 'deleteCustomSprayRecords', table: 'custom_spray_records' },
    { name: 'tillage', mapper: 'tillage', addKey: 'addTillageRecord', addInput: { fieldId: 'field-1', fieldName: 'North 40', implementType: 'Field Cultivator', date: '2026-04-01' }, useHook: tillage.useTillageRecords, recordsKey: 'tillageRecords', setterKey: 'setTillageRecords', updateKey: 'updateTillageRecord', deleteKey: 'deleteTillageRecords', table: 'tillage_records' },
    { name: 'fertilizer', mapper: 'fertilizer', addKey: 'addFertilizerApplication', addInput: { fieldId: 'field-1', fieldName: 'North 40', acres: 80 }, useHook: fertilizer.useFertilizerRecords, recordsKey: 'fertilizerApplications', setterKey: 'setFertilizerApplications', updateKey: 'updateFertilizerApplication', deleteKey: 'deleteFertilizerApplications', table: 'fertilizer_applications' },
  ];
});

function renderConfigured(config: Config, online: boolean, farmId: string | null = 'farm-1') {
  const original = { id: 'record-1', farm_id: 'farm-1', fieldId: 'field-1', fieldName: 'North 40', deleted_at: null };
  return renderHook(() => {
    const state = useStatefulArray<any>([original]);
    const args: any = {
      farm_id: farmId, viewingSeason: 2026, fields: [{ id: 'field-1', name: 'North 40' }],
      isOnline: online, onMutation: vi.fn(),
      [config.recordsKey]: state.value,
      [config.setterKey]: state.setValue,
    };
    return { state, ops: config.useHook(args), original };
  });
}

describe('activity hook rollback conformance', () => {
  beforeEach(() => {
    cloud.reset();
    Object.values(mapperMocks).forEach(m => { m.mockReset(); m.mockImplementation((v: unknown) => v); });
    enqueueMutation.mockReset().mockResolvedValue(undefined);
    enqueueMutations.mockReset().mockResolvedValue(undefined);
    toastError.mockReset();
  });

  it('loads every activity hook configuration', () => expect(configs).toHaveLength(7));

  it('shows actionable feedback when an update targets a stale local record', async () => {
    for (const config of configs) {
      const { result, unmount } = renderConfigured(config, true);
      await act(async () => {
        expect(await result.current.ops[config.updateKey]({ ...result.current.original, id: 'missing' })).toBe(false);
      });
      expect(toastError).toHaveBeenLastCalledWith('Could not update record — refresh and try again.');
      unmount();
    }
  });

  for (const index of Array.from({ length: 7 }, (_, i) => i)) {
    it(`hook ${index + 1} restores its render-closure snapshot on update failure`, async () => {
      const config = configs[index];
      cloud.setResult({ count: 0, error: null });
      const { result } = renderConfigured(config, true);
      const changed = { ...result.current.original, fieldName: 'Changed' };

      await act(async () => expect(await result.current.ops[config.updateKey](changed)).toBe(false));

      expect(result.current.state.value).toEqual([result.current.original]);
    });

    it(`hook ${index + 1} atomically rolls back an offline bulk delete`, async () => {
      const config = configs[index];
      enqueueMutations.mockRejectedValueOnce(new Error('storage full'));
      const { result } = renderConfigured(config, false);

      await act(async () => expect(await result.current.ops[config.deleteKey](['record-1'])).toBe(false));

      expect(enqueueMutations).toHaveBeenCalledWith([
        expect.objectContaining({ tableName: config.table, operation: 'soft_delete' }),
      ]);
      expect(result.current.state.value).toEqual([result.current.original]);
    });

    it(`hook ${index + 1} guards every mutation behind a farm selection`, async () => {
      const config = configs[index];
      const { result } = renderConfigured(config, true, null);

      await act(async () => expect(await result.current.ops[config.addKey](config.addInput)).toBe(false));

      expect(toastError).toHaveBeenLastCalledWith('No farm selected.');
      expect(result.current.state.value).toHaveLength(1); // only the pre-existing record
      expect(cloud.fns.from).not.toHaveBeenCalled();
      expect(mapperMocks[config.mapper]).not.toHaveBeenCalled();
    });

    it(`hook ${index + 1} stamps viewingSeason and farm_id through its mapper on add`, async () => {
      const config = configs[index];
      const { result } = renderConfigured(config, true);

      await act(async () => expect(await result.current.ops[config.addKey](config.addInput)).toBe(true));

      // The mapper must see the fully stamped app record — the seam where the
      // viewingSeason (not activeSeason) rule is enforced.
      expect(mapperMocks[config.mapper]).toHaveBeenCalledWith(
        expect.objectContaining({ seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }),
      );
    });

    it(`hook ${index + 1} optimistically appends on add and keeps it on success`, async () => {
      const config = configs[index];
      cloud.setResult({ count: 1, error: null });
      const { result } = renderConfigured(config, true);
      const before = result.current.state.value.length;

      await act(async () => expect(await result.current.ops[config.addKey](config.addInput)).toBe(true));

      expect(result.current.state.value).toHaveLength(before + 1);
      expect(result.current.state.value[before]).toMatchObject({
        id: expect.any(String),
        fieldId: 'field-1',
        seasonYear: 2026,
        farm_id: 'farm-1',
        deleted_at: null,
      });
      expect(cloud.fns.from).toHaveBeenCalledWith(config.table);
    });

    it(`hook ${index + 1} rolls back the optimistic append when the insert fails`, async () => {
      const config = configs[index];
      cloud.setResult({ count: 0, error: { message: 'insert failed' } });
      const { result } = renderConfigured(config, true);
      const before = result.current.state.value;

      await act(async () => expect(await result.current.ops[config.addKey](config.addInput)).toBe(false));

      expect(result.current.state.value).toEqual(before);
    });

    it(`hook ${index + 1} rolls back an online soft delete when the row count does not match`, async () => {
      const config = configs[index];
      // RLS trap regression guard: the deleted_at IS NULL SELECT policy hides
      // soft-deleted rows, so a zero exact count must be treated as failure.
      cloud.setResult({ count: 0, error: null });
      const { result } = renderConfigured(config, true);

      await act(async () => expect(await result.current.ops[config.deleteKey](['record-1'])).toBe(false));

      expect(result.current.state.value).toEqual([result.current.original]);
    });
  }
});
