import { describe, it, expect, vi } from 'vitest';
import { mapSprayFromDb } from '../mappers';
import { SprayRecordRow } from '../../types/database';

/**
 * Creates a minimal valid SprayRecordRow for testing.
 * All required fields have sensible defaults; optional fields can be overridden.
 */
function makeSprayRow(overrides: Partial<SprayRecordRow> = {}): SprayRecordRow {
  return {
    id: 'spray-1',
    farm_id: 'farm-1',
    field_id: 'field-1',
    field_name: 'North Field',
    products: null,
    wind_speed: 5,
    temperature: 75,
    spray_date: null,
    start_time: null,
    end_time: null,
    equipment_id: '',
    applicator_name: '',
    license_number: '',
    epa_reg_number: '',
    season_year: 2026,
    timestamp: '2026-03-25T08:00:00Z',
    ...overrides,
  };
}

describe('mapSprayFromDb — optionalStr behavior (6.2 regression)', () => {
  it('converts null optional string fields to undefined', () => {
    const row = makeSprayRow({
      applicator_name: null as any,
      license_number: null as any,
      notes: null as any,
      spray_date: null,
      target_pest: null as any,
    });
    const result = mapSprayFromDb(row);

    expect(result.applicatorName).toBeUndefined();
    expect(result.licenseNumber).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.sprayDate).toBeUndefined();
    expect(result.targetPest).toBeUndefined();
  });

  it('converts empty string optional fields to undefined', () => {
    const row = makeSprayRow({
      applicator_name: '',
      license_number: '',
      notes: '',
      spray_date: '',
      target_pest: '',
    });
    const result = mapSprayFromDb(row);

    expect(result.applicatorName).toBeUndefined();
    expect(result.licenseNumber).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.sprayDate).toBeUndefined();
    expect(result.targetPest).toBeUndefined();
  });

  it('preserves non-empty string values', () => {
    const row = makeSprayRow({
      applicator_name: 'John Doe',
      license_number: 'L12345',
      notes: 'Some notes',
      spray_date: '2026-03-25',
      target_pest: 'Pigweed',
    });
    const result = mapSprayFromDb(row);

    expect(result.applicatorName).toBe('John Doe');
    expect(result.licenseNumber).toBe('L12345');
    expect(result.notes).toBe('Some notes');
    expect(result.sprayDate).toBe('2026-03-25');
    expect(result.targetPest).toBe('Pigweed');
  });

  it('treatedAreaUnit defaults to "ac" when empty string', () => {
    const row = makeSprayRow({ treated_area_unit: '' });
    const result = mapSprayFromDb(row);
    expect(result.treatedAreaUnit).toBe('ac');
  });

  it('treatedAreaUnit defaults to "ac" when null', () => {
    const row = makeSprayRow({ treated_area_unit: null });
    const result = mapSprayFromDb(row);
    expect(result.treatedAreaUnit).toBe('ac');
  });

  it('complianceProfile defaults to "universal" when empty string', () => {
    const row = makeSprayRow({ compliance_profile: '' as any });
    const result = mapSprayFromDb(row);
    expect(result.complianceProfile).toBe('universal');
  });
});

describe('mapSprayFromDb — null products handling', () => {
  it('returns empty array when products is null', () => {
    const row = makeSprayRow({ products: null });
    const result = mapSprayFromDb(row);
    expect(result.products).toEqual([]);
  });

  it('returns empty array when products is undefined', () => {
    const row = makeSprayRow({ products: undefined });
    const result = mapSprayFromDb(row);
    expect(result.products).toEqual([]);
  });

  it('maps product entries correctly with all optional fields', () => {
    const row = makeSprayRow({
      products: [
        {
          product: 'Roundup',
          rate: '22',
          rateUnit: 'oz/ac',
          epaRegNumber: '524-549',
          activeIngredients: 'Glyphosate 41%',
          totalProductAmount: '1760',
          totalProductUnit: 'oz',
        },
        {
          product: 'Atrazine',
          rate: '1.5',
          rateUnit: 'qt/ac',
          epaRegNumber: null,
          activeIngredients: null,
          totalProductAmount: null,
          totalProductUnit: null,
        },
      ],
    });
    const result = mapSprayFromDb(row);

    expect(result.products).toHaveLength(2);
    expect(result.products[0].product).toBe('Roundup');
    expect(result.products[0].epaRegNumber).toBe('524-549');
    expect(result.products[0].activeIngredients).toBe('Glyphosate 41%');
    expect(result.products[0].totalProductAmount).toBe('1760');

    // Second product: null optional fields become undefined
    expect(result.products[1].product).toBe('Atrazine');
    expect(result.products[1].epaRegNumber).toBeUndefined();
    expect(result.products[1].activeIngredients).toBeUndefined();
    expect(result.products[1].totalProductAmount).toBeUndefined();
  });
});

describe('mapSprayFromDb — numeric fields', () => {
  it('defaults wind_speed and temperature to 0 for null', () => {
    const row = makeSprayRow({
      wind_speed: null as any,
      temperature: null as any,
    });
    const result = mapSprayFromDb(row);
    expect(result.windSpeed).toBe(0);
    expect(result.temperature).toBe(0);
  });

  it('handles treated_area_size null as 0', () => {
    const row = makeSprayRow({ treated_area_size: null });
    const result = mapSprayFromDb(row);
    expect(result.treatedAreaSize).toBe(0);
  });

  it('handles treated_area_size empty string as 0', () => {
    const row = makeSprayRow({ treated_area_size: '' });
    const result = mapSprayFromDb(row);
    expect(result.treatedAreaSize).toBe(0);
  });

  it('handles treated_area_size valid number', () => {
    const row = makeSprayRow({ treated_area_size: '80.5' });
    const result = mapSprayFromDb(row);
    expect(result.treatedAreaSize).toBe(80.5);
  });

  it('warns and defaults to 0 for non-numeric treated_area_size', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const row = makeSprayRow({ treated_area_size: 'N/A' });
    const result = mapSprayFromDb(row);
    expect(result.treatedAreaSize).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('treated_area_size is non-numeric for record "spray-1": "N/A"')
    );
    warnSpy.mockRestore();
  });

  it('warns and defaults to 0 for non-numeric total_amount_applied', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const row = makeSprayRow({ total_amount_applied: 'unknown' });
    const result = mapSprayFromDb(row);
    expect(result.totalAmountApplied).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('total_amount_applied is non-numeric for record "spray-1": "unknown"')
    );
    warnSpy.mockRestore();
  });

  it('relativeHumidity becomes undefined for null', () => {
    const row = makeSprayRow({ relative_humidity: null });
    const result = mapSprayFromDb(row);
    expect(result.relativeHumidity).toBeUndefined();
  });
});

describe('mapSprayFromDb — boolean fields', () => {
  it('isPremixed defaults to false for null', () => {
    const row = makeSprayRow({ is_premixed: null });
    const result = mapSprayFromDb(row);
    expect(result.isPremixed).toBe(false);
  });

  it('nonCompliant defaults to false for null', () => {
    const row = makeSprayRow({ non_compliant: null });
    const result = mapSprayFromDb(row);
    expect(result.nonCompliant).toBe(false);
  });
});

describe('mapSprayFromDb — required fields', () => {
  it('always returns fieldName even when empty string (safeStr with fallback)', () => {
    const row = makeSprayRow({ field_name: '' });
    const result = mapSprayFromDb(row);
    // safeStr('', 'Unknown Field') returns ''
    expect(result.fieldName).toBe('');
  });

  it('falls back to "Unknown Field" when field_name is null', () => {
    const row = makeSprayRow({ field_name: null as any });
    const result = mapSprayFromDb(row);
    expect(result.fieldName).toBe('Unknown Field');
  });
});
