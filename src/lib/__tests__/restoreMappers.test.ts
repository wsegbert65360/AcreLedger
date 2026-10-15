import { describe, expect, it } from 'vitest';
import { mapSprayToDb } from '@/lib/mappers';
import { mapSprayToDbForRestore, omitUnspecifiedRestoreKeys } from '@/lib/restoreMappers';
import type { SprayRecord } from '@/types/farm';

function v2Spray(overrides: Partial<SprayRecord> = {}): SprayRecord {
  return {
    id: 'spray-1',
    farm_id: 'farm-1',
    fieldId: 'field-1',
    fieldName: 'North',
    seasonYear: 2025,
    products: [{ product: 'Glyphosate', rate: '32', rateUnit: 'oz/ac' }],
    ...overrides,
  } as SprayRecord;
}

describe('restore mapping key preservation', () => {
  it('drops water_rate, pic, and nozzle keys when a v2 spray row never had those fields', () => {
    const source = v2Spray();
    expect('waterRate' in source).toBe(false);
    expect('pic' in source).toBe(false);
    expect('nozzleType' in source).toBe(false);

    const writeMapped = mapSprayToDb(source) as Record<string, unknown>;
    expect(writeMapped).toHaveProperty('water_rate');
    expect(writeMapped).toHaveProperty('pic');
    expect(writeMapped).toHaveProperty('nozzle_type');

    const restored = mapSprayToDbForRestore(source);
    expect(restored).not.toHaveProperty('water_rate');
    expect(restored).not.toHaveProperty('water_rate_unit');
    expect(restored).not.toHaveProperty('pic');
    expect(restored).not.toHaveProperty('nozzle_type');
    expect(restored).not.toHaveProperty('nozzle_size');
    expect(restored).not.toHaveProperty('pressure_psi');
    expect(restored.id).toBe('spray-1');
    expect(restored.farm_id).toBe('farm-1');
    expect(restored).toHaveProperty('deleted_at');
    expect(restored.deleted_at).toBeNull();
  });

  it('does not replace a missing timestamp with now()', () => {
    const source = v2Spray();
    expect(source.timestamp).toBeUndefined();

    const writeMapped = mapSprayToDb(source) as Record<string, unknown>;
    expect(typeof writeMapped.timestamp).toBe('string');

    const restored = mapSprayToDbForRestore(source);
    expect(restored).not.toHaveProperty('timestamp');
  });

  it('keeps timestamp and optional columns that the backup actually stored', () => {
    const source = v2Spray({
      timestamp: 1_704_067_200_000,
      waterRate: '15',
      waterRateUnit: 'gpa',
      pic: '3ABCD123',
      nozzleType: 'TT11004',
      deleted_at: null,
    });
    const restored = mapSprayToDbForRestore(source);
    expect(restored.timestamp).toBe(new Date(1_704_067_200_000).toISOString());
    expect(restored.water_rate).toBe('15');
    expect(restored.water_rate_unit).toBe('gpa');
    expect(restored.pic).toBe('3ABCD123');
    expect(restored.nozzle_type).toBe('TT11004');
    expect(restored.deleted_at).toBeNull();
  });

  it('keeps deleted_at explicit when the source omitted it', () => {
    const restored = omitUnspecifiedRestoreKeys(
      { id: '1', farm_id: 'f', deleted_at: null, notes: 'x' },
      { id: '1', farm_id: 'f' },
    );
    expect(restored.deleted_at).toBeNull();
    expect(restored).not.toHaveProperty('notes');
  });
});
