/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';
import type { Field, GrainMovement, HarvestRecord } from '@/types/farm';

const cloud = createSupabaseMock();
const enqueueMutations = vi.fn();
vi.doMock('@/lib/supabase', () => ({ supabase: cloud.client }));
vi.doMock('@/lib/syncQueue', () => ({
  LINKED_GRAIN_MUTATION_KEY: '__linked_grain_movement',
  syncQueue: { enqueueMutation: vi.fn(), enqueueMutations },
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useHarvestRecords: typeof import('../useHarvestRecords').useHarvestRecords;
beforeAll(async () => {
  ({ useHarvestRecords } = await import('../useHarvestRecords'));
});

const FARM_ID = '00000000-0000-0000-0000-000000000100';
const FIELD_A_ID = '00000000-0000-0000-0000-000000000102';
const FIELD_B_ID = '00000000-0000-0000-0000-000000000105';
const BIN_ID = '00000000-0000-0000-0000-000000000103';

const fieldA: Field = {
  id: FIELD_A_ID, name: 'North 40', acreage: 40, lat: null, lng: null,
  farm_id: FARM_ID, deleted_at: null,
};
const fieldB: Field = {
  id: FIELD_B_ID, name: 'South 80', acreage: 80, lat: null, lng: null,
  farm_id: FARM_ID, deleted_at: null,
};
const deletedFieldC: Field = {
  id: '00000000-0000-0000-0000-000000000106', name: 'Old Home', acreage: 10, lat: null, lng: null,
  farm_id: FARM_ID, deleted_at: '2026-01-01T00:00:00.000Z',
};

const movedLoad: HarvestRecord = {
  id: '00000000-0000-0000-0000-000000000101',
  fieldId: FIELD_A_ID,
  fieldName: 'North 40',
  destination: 'bin',
  binId: BIN_ID,
  moisturePercent: 15,
  landlordSplitPercent: 0,
  bushels: 1200,
  timestamp: 1788650000000,
  seasonYear: 2026,
  farm_id: FARM_ID,
  deleted_at: null,
};
const otherLoad: HarvestRecord = {
  ...movedLoad,
  id: '00000000-0000-0000-0000-000000000107',
  fieldId: FIELD_B_ID,
  fieldName: 'South 80',
  bushels: 300,
};
const linkedMovement: GrainMovement = {
  id: '00000000-0000-0000-0000-000000000104',
  binId: BIN_ID,
  binName: 'Bin 1',
  type: 'in',
  bushels: 1200,
  moisturePercent: 15,
  sourceFieldName: 'North 40',
  timestamp: 1788650000000,
  seasonYear: 2026,
  farm_id: FARM_ID,
  deleted_at: null,
  harvestRecordId: movedLoad.id,
  version: 3,
};

const seasonTotal = (records: HarvestRecord[], fieldId: string) =>
  records
    .filter(record => record.fieldId === fieldId && !record.deleted_at)
    .reduce((sum, record) => sum + record.bushels, 0);

function renderReassignHook(
  isOnline: boolean,
  initialHarvests: HarvestRecord[] = [],
  initialGrains: GrainMovement[] = [],
  fields: Field[] = [fieldA, fieldB, deletedFieldC],
) {
  return renderHook(() => {
    const harvests = useStatefulArray<HarvestRecord>(initialHarvests);
    const grains = useStatefulArray<GrainMovement>(initialGrains);
    const ops = useHarvestRecords({
      farm_id: FARM_ID,
      viewingSeason: 2026,
      fields,
      harvestRecords: harvests.value,
      setHarvestRecords: harvests.setValue,
      grainMovements: grains.value,
      setGrainMovements: grains.setValue,
      isOnline,
      onMutation: vi.fn(),
    });
    return { harvests, grains, ops };
  });
}

describe('useHarvestRecords.reassignHarvestField', () => {
  beforeEach(() => {
    cloud.reset();
    enqueueMutations.mockReset().mockResolvedValue(undefined);
  });

  it('moves the load to the new field online and updates the linked grain movement', async () => {
    const { result } = renderReassignHook(true, [movedLoad, otherLoad], [linkedMovement]);

    await act(async () => {
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, FIELD_B_ID, '  Wrong field at the truck  '))
        .resolves.toBe(true);
    });

    const harvest = result.current.harvests.value.find(record => record.id === movedLoad.id);
    expect(harvest).toMatchObject({
      fieldId: FIELD_B_ID,
      fieldName: 'South 80',
      moveReason: 'Wrong field at the truck',
      seasonYear: movedLoad.seasonYear,
      farm_id: FARM_ID,
      bushels: movedLoad.bushels,
    });

    // Season totals are derived from harvestRecords by fieldId: the load left
    // field A entirely and added its bushels to field B's existing total.
    expect(seasonTotal(result.current.harvests.value, FIELD_A_ID)).toBe(0);
    expect(seasonTotal(result.current.harvests.value, FIELD_B_ID)).toBe(1200 + 300);

    const grain = result.current.grains.value.find(record => record.id === linkedMovement.id);
    expect(grain).toMatchObject({
      sourceFieldName: 'South 80',
      harvestRecordId: movedLoad.id,
      version: 4,
    });

    expect(cloud.fns.from).toHaveBeenCalledWith('harvest_records');
    expect(cloud.fns.update).toHaveBeenCalledWith(
      { field_id: FIELD_B_ID, field_name: 'South 80', move_reason: 'Wrong field at the truck' },
      { count: 'exact' },
    );
    expect(cloud.fns.eq).toHaveBeenCalledWith('id', movedLoad.id);
    expect(cloud.fns.eq).toHaveBeenCalledWith('farm_id', FARM_ID);
    expect(cloud.fns.from).toHaveBeenCalledWith('grain_movements');
    expect(cloud.fns.update).toHaveBeenCalledWith({ source_field_name: 'South 80' }, { count: 'exact' });
    expect(cloud.fns.eq).toHaveBeenCalledWith('version', 3);
  });

  it('queues the harvest and linked grain updates as one offline batch', async () => {
    const { result } = renderReassignHook(false, [movedLoad], [linkedMovement]);

    await act(async () => {
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, FIELD_B_ID, 'Split field mistake'))
        .resolves.toBe(true);
    });

    expect(enqueueMutations).toHaveBeenCalledTimes(1);
    expect(enqueueMutations).toHaveBeenCalledWith([
      expect.objectContaining({
        tableName: 'harvest_records',
        operation: 'update',
        farmId: FARM_ID,
        payload: {
          id: movedLoad.id,
          field_id: FIELD_B_ID,
          field_name: 'South 80',
          move_reason: 'Split field mistake',
        },
      }),
      expect.objectContaining({
        tableName: 'grain_movements',
        operation: 'update',
        farmId: FARM_ID,
        payload: {
          id: linkedMovement.id,
          source_field_name: 'South 80',
          __expected_version: 3,
        },
      }),
    ]);

    expect(result.current.harvests.value.find(record => record.id === movedLoad.id))
      .toMatchObject({ fieldId: FIELD_B_ID, fieldName: 'South 80' });
    expect(result.current.grains.value.find(record => record.id === linkedMovement.id))
      .toMatchObject({ sourceFieldName: 'South 80', version: 4 });
  });

  it('rolls back the harvest and grain state when the update affects zero rows', async () => {
    cloud.setResult({ data: null, error: null, count: 0 });
    const { result } = renderReassignHook(true, [movedLoad], [linkedMovement]);

    await act(async () => {
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, FIELD_B_ID)).resolves.toBe(false);
    });

    expect(result.current.harvests.value).toEqual([movedLoad]);
    expect(result.current.grains.value).toEqual([linkedMovement]);
  });

  it('rolls back when the linked grain movement hits a version conflict', async () => {
    cloud.setTableHandler('grain_movements', { data: null, error: null, count: 0 });
    const { result } = renderReassignHook(true, [movedLoad], [linkedMovement]);

    await act(async () => {
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, FIELD_B_ID)).resolves.toBe(false);
    });

    expect(result.current.harvests.value).toEqual([movedLoad]);
    expect(result.current.grains.value).toEqual([linkedMovement]);
  });

  it('rejects reassignment to the same field, an unknown field, or a deleted field', async () => {
    const { result } = renderReassignHook(true, [movedLoad], [linkedMovement]);

    await act(async () => {
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, FIELD_A_ID)).resolves.toBe(false);
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, '00000000-0000-0000-0000-000000000999')).resolves.toBe(false);
      await expect(result.current.ops.reassignHarvestField(movedLoad.id, deletedFieldC.id)).resolves.toBe(false);
    });

    expect(result.current.harvests.value).toEqual([movedLoad]);
    expect(result.current.grains.value).toEqual([linkedMovement]);
    expect(cloud.fns.update).not.toHaveBeenCalled();
    expect(enqueueMutations).not.toHaveBeenCalled();
  });

  it('clears a prior move reason when moving again without one', async () => {
    const preMoved: HarvestRecord = { ...movedLoad, moveReason: 'First correction' };
    const { result } = renderReassignHook(true, [preMoved], [linkedMovement]);

    await act(async () => {
      await expect(result.current.ops.reassignHarvestField(preMoved.id, FIELD_B_ID)).resolves.toBe(true);
    });

    const harvest = result.current.harvests.value.find(record => record.id === preMoved.id);
    expect(harvest?.moveReason).toBeUndefined();
    expect(cloud.fns.update).toHaveBeenCalledWith(
      expect.objectContaining({ move_reason: null }),
      { count: 'exact' },
    );
  });
});
