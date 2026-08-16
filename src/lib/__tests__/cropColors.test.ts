import { describe, expect, it } from 'vitest';

import type { PlantRecord } from '@/types/farm';
import { getCropColorKey, getFieldPlantedCrop, getPlantedCropColorStyles, normalizeCropName } from '../cropColors';

function planting(overrides: Partial<PlantRecord> = {}): PlantRecord {
  return {
    id: 'plant-1',
    fieldId: 'field-1',
    fieldName: 'Home',
    seedVariety: 'DKC',
    acreage: 80,
    crop: 'Corn',
    plantDate: '2026-04-15',
    timestamp: Date.parse('2026-04-15'),
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
    ...overrides,
  };
}

describe('getCropColorKey', () => {
  it('maps common Midwest crop names to the expected color keys', () => {
    expect(getCropColorKey('Corn')).toBe('corn');
    expect(getCropColorKey('field corn')).toBe('corn');
    expect(getCropColorKey('Soybeans')).toBe('soybean');
    expect(getCropColorKey('double-crop soy')).toBe('soybean');
    expect(getCropColorKey('Winter Wheat')).toBe('wheat');
    expect(getCropColorKey('Milo')).toBe('sorghum');
    expect(getCropColorKey('Alfalfa')).toBe('hay');
  });

  it('returns null for unknown or empty names so intended-use chips stay uncolored', () => {
    expect(getCropColorKey('Canola')).toBeNull();
    expect(getCropColorKey('Grain')).toBeNull();
    expect(getCropColorKey('')).toBeNull();
    expect(getCropColorKey(undefined)).toBeNull();
  });

  it('falls back to the other planted style for an unrecognized crop name', () => {
    expect(getPlantedCropColorStyles('Canola')?.key).toBe('other');
    expect(getPlantedCropColorStyles('')).toBeNull();
  });
});

describe('normalizeCropName', () => {
  it('strips punctuation and case', () => {
    expect(normalizeCropName('  Soy-Beans ')).toBe('soy beans');
  });
});

describe('getFieldPlantedCrop', () => {
  it('uses the latest in-season planted crop and ignores prevented or deleted rows', () => {
    const records = [
      planting({ id: 'older', crop: 'Wheat', plantDate: '2026-03-01' }),
      planting({ id: 'latest', crop: 'Soybeans', plantDate: '2026-05-20' }),
      planting({ id: 'prevented', crop: 'Corn', plantDate: '2026-06-01', cropStatus: 'Prevented Planting' }),
      planting({ id: 'deleted', crop: 'Cotton', plantDate: '2026-07-01', deleted_at: '2026-07-02T00:00:00.000Z' }),
      planting({ id: 'last-year', crop: 'Corn', seasonYear: 2025, plantDate: '2025-04-01' }),
    ];

    expect(getFieldPlantedCrop(records, 'field-1', 2026)).toBe('Soybeans');
  });

  it('returns undefined when the field has no current planting crop', () => {
    expect(getFieldPlantedCrop([planting({ fieldId: 'other' })], 'field-1', 2026)).toBeUndefined();
  });
});
