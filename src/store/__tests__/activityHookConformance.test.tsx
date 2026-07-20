/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';

const cloud = createSupabaseMock();
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();
const toastError = vi.fn();

vi.doMock('@/lib/supabase', () => ({ supabase: cloud.client }));
vi.doMock('@/lib/syncQueue', () => ({ syncQueue: { enqueueMutation, enqueueMutations } }));
vi.doMock('@/lib/mappers', () => ({
  mapPlantToDb: vi.fn((v: unknown) => v), mapSprayToDb: vi.fn((v: unknown) => v),
  mapHarvestToDb: vi.fn((v: unknown) => v), mapHayToDb: vi.fn((v: unknown) => v),
  mapCustomSprayToDb: vi.fn((v: unknown) => v), mapTillageToDb: vi.fn((v: unknown) => v),
  mapFertilizerToDb: vi.fn((v: unknown) => v),
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));

interface Config {
  name: string;
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
    { name: 'plant', useHook: plant.usePlantRecords, recordsKey: 'plantRecords', setterKey: 'setPlantRecords', updateKey: 'updatePlantRecord', deleteKey: 'deletePlantRecords', table: 'plant_records' },
    { name: 'spray', useHook: spray.useSprayRecords, recordsKey: 'sprayRecords', setterKey: 'setSprayRecords', updateKey: 'updateSprayRecord', deleteKey: 'deleteSprayRecords', table: 'spray_records' },
    { name: 'harvest', useHook: harvest.useHarvestRecords, recordsKey: 'harvestRecords', setterKey: 'setHarvestRecords', updateKey: 'updateHarvestRecord', deleteKey: 'deleteHarvestRecords', table: 'harvest_records' },
    { name: 'hay', useHook: hay.useHayRecords, recordsKey: 'hayHarvestRecords', setterKey: 'setHayHarvestRecords', updateKey: 'updateHayHarvestRecord', deleteKey: 'deleteHayHarvestRecords', table: 'hay_harvest_records' },
    { name: 'custom spray', useHook: custom.useCustomSprayRecords, recordsKey: 'customSprayRecords', setterKey: 'setCustomSprayRecords', updateKey: 'updateCustomSprayRecord', deleteKey: 'deleteCustomSprayRecords', table: 'custom_spray_records' },
    { name: 'tillage', useHook: tillage.useTillageRecords, recordsKey: 'tillageRecords', setterKey: 'setTillageRecords', updateKey: 'updateTillageRecord', deleteKey: 'deleteTillageRecords', table: 'tillage_records' },
    { name: 'fertilizer', useHook: fertilizer.useFertilizerRecords, recordsKey: 'fertilizerApplications', setterKey: 'setFertilizerApplications', updateKey: 'updateFertilizerApplication', deleteKey: 'deleteFertilizerApplications', table: 'fertilizer_applications' },
  ];
});

function renderConfigured(config: Config, online: boolean) {
  const original = { id: 'record-1', farm_id: 'farm-1', fieldId: 'field-1', fieldName: 'North 40', deleted_at: null };
  return renderHook(() => {
    const state = useStatefulArray<any>([original]);
    const args: any = {
      farm_id: 'farm-1', viewingSeason: 2026, fields: [{ id: 'field-1', name: 'North 40' }],
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
  }
});
