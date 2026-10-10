import { describe, expect, it } from 'vitest';
import { MAX_SYNC_RETRIES, type QueuedMutation } from '@/lib/syncQueue';
import type { Equipment } from '@/types/equipment';
import { applyParkedEquipmentMutations } from './parked';

const machine: Equipment = {
  id: 'cloud-1', farm_id: 'farm-1', kind: 'tractor', make: 'Deere', meterUnit: 'hours',
  currentReading: 1000, status: 'active', createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
};

function parked(overrides: Partial<QueuedMutation>): QueuedMutation {
  return {
    id: 'q1',
    table_name: 'equipment',
    operation: 'insert',
    payload: {},
    farm_id: 'farm-1',
    created_at: '2026-01-01T00:00:00Z',
    retry_count: MAX_SYNC_RETRIES,
    ...overrides,
  };
}

describe('applyParkedEquipmentMutations', () => {
  it('keeps a parked equipment insert that the cloud snapshot omitted', () => {
    const result = applyParkedEquipmentMutations([machine], [], [], [
      parked({
        payload: {
          id: 'local-1', farm_id: 'farm-1', kind: 'truck', meter_unit: 'miles',
          current_reading: 12, status: 'active', created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
        },
      }),
    ]);
    expect(result.equipment.map(item => item.id)).toEqual(['cloud-1', 'local-1']);
    expect(result.equipment[1]).toMatchObject({ kind: 'truck', currentReading: 12, meterUnit: 'miles' });
  });

  it('ignores parked rows from other tables', () => {
    const result = applyParkedEquipmentMutations([machine], [], [], [
      parked({ table_name: 'spray_records', payload: { id: 'spray-1' } }),
    ]);
    expect(result.equipment).toEqual([machine]);
  });
});
