import { describe, expect, it } from 'vitest';
import type { Field, PlantRecord } from '@/types/farm';
import { resolveWorkRequestFieldCrop } from './useWorkRequestForm';

const field: Field = {
  id: 'field-1',
  name: 'Grandma Bins/Hwy',
  acreage: 105.63,
  lat: 38.46059,
  lng: -93.52707,
  intendedUse: 'Grain',
  farm_id: 'farm-1',
  deleted_at: null,
};

function planting(overrides: Partial<PlantRecord> = {}): PlantRecord {
  return {
    id: 'plant-1',
    fieldId: field.id,
    fieldName: field.name,
    seedVariety: 'AG36X6',
    acreage: 105.63,
    crop: 'Soybeans',
    plantDate: '2026-05-10',
    timestamp: new Date('2026-05-10').getTime(),
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
    ...overrides,
  };
}

describe('resolveWorkRequestFieldCrop', () => {
  it('defaults to the latest active planting crop in the viewing season', () => {
    const records = [
      planting({ id: 'older', crop: 'Corn', plantDate: '2026-04-01' }),
      planting({ id: 'latest', crop: 'Soybeans', plantDate: '2026-05-10' }),
      planting({ id: 'other-season', crop: 'Wheat', seasonYear: 2025, plantDate: '2026-06-01' }),
      planting({ id: 'deleted', crop: 'Cotton', plantDate: '2026-07-01', deleted_at: '2026-07-02T00:00:00.000Z' }),
    ];

    expect(resolveWorkRequestFieldCrop(field, records, 2026)).toBe('Soybeans');
  });

  it('falls back to the field intended use when no current planting exists', () => {
    expect(resolveWorkRequestFieldCrop(field, [], 2026)).toBe('Grain');
  });
});
