/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';
import type { GrainMovement, HarvestRecord } from '@/types/farm';

const cloud = createSupabaseMock();
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();
vi.doMock('@/lib/supabase', () => ({ supabase: cloud.client }));
vi.doMock('@/lib/syncQueue', () => ({
  LINKED_GRAIN_MUTATION_KEY: '__linked_grain_movement',
  syncQueue: { enqueueMutation, enqueueMutations },
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useHarvestRecords: typeof import('../useHarvestRecords').useHarvestRecords;
beforeAll(async () => {
  ({ useHarvestRecords } = await import('../useHarvestRecords'));
});

const harvest: Omit<HarvestRecord, 'deleted_at' | 'seasonYear' | 'farm_id'> = {
  id: '00000000-0000-0000-0000-000000000101',
  fieldId: '00000000-0000-0000-0000-000000000102',
  fieldName: 'North 40',
  destination: 'bin',
  binId: '00000000-0000-0000-0000-000000000103',
  moisturePercent: 15,
  landlordSplitPercent: 0,
  bushels: 1200,
  timestamp: 1788650000000,
};
const grainMovement: Omit<GrainMovement, 'deleted_at' | 'seasonYear' | 'farm_id' | 'version'> = {
  id: '00000000-0000-0000-0000-000000000104',
  binId: '00000000-0000-0000-0000-000000000103',
  binName: 'Bin 1',
  type: 'in',
  bushels: 1200,
  moisturePercent: 15,
  sourceFieldName: 'North 40',
  timestamp: 1788650000000,
  harvestRecordId: harvest.id,
};

function renderLinkedHook(
  isOnline: boolean,
  initialHarvests: HarvestRecord[] = [],
  initialGrains: GrainMovement[] = [],
) {
  return renderHook(() => {
    const harvests = useStatefulArray<HarvestRecord>(initialHarvests);
    const grains = useStatefulArray<GrainMovement>(initialGrains);
    const ops = useHarvestRecords({
      farm_id: '00000000-0000-0000-0000-000000000100',
      viewingSeason: 2026,
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

describe('useHarvestRecords linked creation', () => {
  beforeEach(() => {
    cloud.reset();
    enqueueMutation.mockReset().mockResolvedValue(undefined);
    enqueueMutations.mockReset().mockResolvedValue(undefined);
  });

  it('creates both records through one database RPC', async () => {
    cloud.setRpcResult({ data: { already_applied: false }, error: null });
    const { result } = renderLinkedHook(true);

    await act(async () => {
      await expect(result.current.ops.addHarvestWithGrain({ harvest, grainMovement })).resolves.toBe(true);
    });

    expect(cloud.fns.rpc).toHaveBeenCalledWith('create_harvest_with_grain', expect.objectContaining({
      p_idempotency_key: harvest.id,
      p_harvest: expect.objectContaining({ id: harvest.id }),
      p_grain_movement: expect.objectContaining({ id: grainMovement.id, version: 1 }),
    }));
    expect(result.current.harvests.value.map(record => record.id)).toEqual([harvest.id]);
    expect(result.current.grains.value.map(record => record.id)).toEqual([grainMovement.id]);
  });

  it('persists the offline pair as one atomic replay operation', async () => {
    const { result } = renderLinkedHook(false);

    await act(async () => {
      await expect(result.current.ops.addHarvestWithGrain({ harvest, grainMovement })).resolves.toBe(true);
    });

    expect(enqueueMutations).toHaveBeenCalledTimes(1);
    expect(enqueueMutations).toHaveBeenCalledWith([expect.objectContaining({
      tableName: 'harvest_records',
      operation: 'insert',
      farmId: '00000000-0000-0000-0000-000000000100',
      payload: expect.objectContaining({
        id: harvest.id,
        __linked_grain_movement: expect.objectContaining({
          id: grainMovement.id,
          harvest_record_id: harvest.id,
        }),
      }),
    })]);
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('rolls back both optimistic records when the transaction fails', async () => {
    cloud.setRpcResult({ data: null, error: { message: 'transaction failed' } });
    const { result } = renderLinkedHook(true);

    await act(async () => {
      await expect(result.current.ops.addHarvestWithGrain({ harvest, grainMovement })).resolves.toBe(false);
    });

    expect(result.current.harvests.value).toEqual([]);
    expect(result.current.grains.value).toEqual([]);
  });

  it('deletes a harvest and its linked grain movement through one database RPC', async () => {
    cloud.setRpcResult({ data: { harvest_count: 1, grain_movement_count: 1 }, error: null });
    const storedHarvest = { ...harvest, farm_id: '00000000-0000-0000-0000-000000000100', seasonYear: 2026, deleted_at: null };
    const storedGrain = { ...grainMovement, farm_id: storedHarvest.farm_id, seasonYear: 2026, deleted_at: null, version: 3 };
    const { result } = renderLinkedHook(true, [storedHarvest], [storedGrain]);

    await act(async () => {
      await expect(result.current.ops.deleteHarvestRecords([harvest.id])).resolves.toBe(true);
    });

    expect(cloud.fns.rpc).toHaveBeenCalledWith('soft_delete_harvests_with_grain', expect.objectContaining({
      p_farm_id: storedHarvest.farm_id,
      p_harvest_ids: [harvest.id],
    }));
    expect(result.current.harvests.value).toEqual([]);
    expect(result.current.grains.value).toEqual([]);
  });

  it('queues the harvest and linked grain soft-deletes as one offline batch', async () => {
    const storedHarvest = { ...harvest, farm_id: '00000000-0000-0000-0000-000000000100', seasonYear: 2026, deleted_at: null };
    const storedGrain = { ...grainMovement, farm_id: storedHarvest.farm_id, seasonYear: 2026, deleted_at: null, version: 4 };
    const { result } = renderLinkedHook(false, [storedHarvest], [storedGrain]);

    await act(async () => {
      await expect(result.current.ops.deleteHarvestRecords([harvest.id])).resolves.toBe(true);
    });

    expect(enqueueMutations).toHaveBeenCalledWith([
      expect.objectContaining({ tableName: 'harvest_records', operation: 'soft_delete' }),
      expect.objectContaining({
        tableName: 'grain_movements',
        operation: 'soft_delete',
        payload: expect.objectContaining({ id: grainMovement.id, __expected_version: 4 }),
      }),
    ]);
    expect(result.current.harvests.value).toEqual([]);
    expect(result.current.grains.value).toEqual([]);
  });

  it('restores both records when transactional deletion fails', async () => {
    cloud.setRpcResult({ data: null, error: { message: 'delete conflict' } });
    const storedHarvest = { ...harvest, farm_id: '00000000-0000-0000-0000-000000000100', seasonYear: 2026, deleted_at: null };
    const storedGrain = { ...grainMovement, farm_id: storedHarvest.farm_id, seasonYear: 2026, deleted_at: null, version: 2 };
    const { result } = renderLinkedHook(true, [storedHarvest], [storedGrain]);

    await act(async () => {
      await expect(result.current.ops.deleteHarvestRecords([harvest.id])).resolves.toBe(false);
    });

    expect(result.current.harvests.value).toEqual([storedHarvest]);
    expect(result.current.grains.value).toEqual([storedGrain]);
  });
});
