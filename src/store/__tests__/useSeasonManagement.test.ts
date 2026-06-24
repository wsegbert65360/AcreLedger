import { describe, it, expect } from 'vitest';
import { backupSchema } from '@/lib/backupSchema';

// ─── Pure function extracted from useSeasonManagement ───────────────────────────

const MIN_SEASON_YEAR = 2000;

function isValidYear(year: number): boolean {
  const maxSeasonYear = new Date().getFullYear() + 1;
  return Number.isInteger(year) && year >= MIN_SEASON_YEAR && year <= maxSeasonYear;
}

// ─── Backup schema validation ─────────────────────────────────────────────────

describe('Backup restore validation (fix #4)', () => {
  function makeValidBackup() {
    return {
      fields: [{ id: 'f1', name: 'Test', farm_id: 'farm-1', acreage: 80, deleted_at: null }],
      activeSeason: 2026,
    };
  }

  it('accepts valid backup with correct activeSeason', () => {
    const result = backupSchema.parse(makeValidBackup());
    expect(result.activeSeason).toBe(2026);
  });

  it('accepts backup without activeSeason', () => {
    const { activeSeason, ...rest } = makeValidBackup();
    const result = backupSchema.parse(rest);
    expect(result.activeSeason).toBeUndefined();
  });


  it('accepts backupDate from settings backups', () => {
    const backup = { ...makeValidBackup(), backupDate: '2026-06-24T12:00:00.000Z' };
    const result = backupSchema.parse(backup);
    expect(result.backupDate).toBe('2026-06-24T12:00:00.000Z');
  });

  it('rejects activeSeason that is a string', () => {
    const backup = { ...makeValidBackup(), activeSeason: '2026' as any };
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('rejects activeSeason that is a boolean', () => {
    const backup = { ...makeValidBackup(), activeSeason: true as any };
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('rejects activeSeason that is null', () => {
    const backup = { ...makeValidBackup(), activeSeason: null as any };
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('accepts backup with extra unknown fields removed by strict mode', () => {
    const backup = { ...makeValidBackup(), extraField: 'value' } as any;
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('accepts backup with all entity types', () => {
    const backup = {
      fields: [{ id: 'f1', name: 'Test', farm_id: 'farm-1', acreage: 80, deleted_at: null }],
      bins: [{ id: 'b1', name: 'Bin', farm_id: 'farm-1', capacity: 5000, deleted_at: null }],
      plantRecords: [{ id: 'p1', fieldId: 'f1', fieldName: 'Test', acreage: 80, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      sprayRecords: [{ id: 's1', fieldId: 'f1', fieldName: 'Test', seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      harvestRecords: [{ id: 'h1', fieldId: 'f1', fieldName: 'Test', bushels: 150, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      hayHarvestRecords: [{ id: 'y1', fieldId: 'f1', fieldName: 'Test', baleCount: 10, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      fertilizerApplications: [{ id: 'fa1', fieldId: 'f1', fieldName: 'Test', acres: 80, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      tillageRecords: [{ id: 't1', fieldId: 'f1', fieldName: 'Test', seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      grainMovements: [{ id: 'g1', binId: 'b1', bushels: 1000, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null }],
      savedSeeds: [{ id: 'se1', name: 'Seed', farm_id: 'farm-1', deleted_at: null }],
      fertilizerRecipes: [{ id: 'fr1', name: 'Recipe', farm_id: 'farm-1', deleted_at: null }],
      sprayRecipes: [{ id: 'sr1', name: 'Recipe', farm_id: 'farm-1', deleted_at: null }],
      fsaTracts: [{
        id: 'tract-1',
        farmId: 'farm-1',
        tractKey: '6418-1417',
        filename: '6418-1417.json',
        featureCount: 1,
        importedAt: '2026-06-16T00:00:00.000Z',
        deletedAt: null,
        geojson: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
            properties: { cluNumber: '11', acres: 10.5 },
          }],
        },
      }],
      cluAssignments: [{
        id: 'assignment-1',
        farmId: 'farm-1',
        fieldId: 'f1',
        tractKey: '6418-1417',
        cluNumber: '11',
        acres: 10.5,
        landUse: 'cropland',
        assignedAt: '2026-06-16T00:00:00.000Z',
        deletedAt: null,
      }],
      activeSeason: 2026,
    };
    const result = backupSchema.parse(backup);
    expect(result.fields).toHaveLength(1);
    expect(result.bins).toHaveLength(1);
    expect(result.fsaTracts).toHaveLength(1);
    expect(result.cluAssignments).toHaveLength(1);
  });
});

// ─── Season year validation ────────────────────────────────────────────────────

describe('isValidYear', () => {
  const currentYear = new Date().getFullYear();

  it('accepts current year', () => {
    expect(isValidYear(currentYear)).toBe(true);
  });

  it('accepts next year', () => {
    expect(isValidYear(currentYear + 1)).toBe(true);
  });

  it('rejects year too far in future', () => {
    expect(isValidYear(currentYear + 2)).toBe(false);
  });

  it('rejects year before MIN_SEASON_YEAR', () => {
    expect(isValidYear(1999)).toBe(false);
  });

  it('accepts MIN_SEASON_YEAR', () => {
    expect(isValidYear(MIN_SEASON_YEAR)).toBe(true);
  });

  it('rejects non-integer years', () => {
    expect(isValidYear(2026.5)).toBe(false);
  });

  it('rejects zero', () => {
    expect(isValidYear(0)).toBe(false);
  });

  it('rejects negative years', () => {
    expect(isValidYear(-1)).toBe(false);
  });
});

// ─── GeoJSON boundary schema validation (fix #5) ────────────────────────────

describe('Backup schema boundary validation (fix #5)', () => {
  it('accepts valid GeoJSON Polygon boundary', () => {
    const backup = {
      fields: [{
        id: 'f1', name: 'Test', farm_id: 'farm-1', acreage: 80, deleted_at: null,
        boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      }],
    };
    const result = backupSchema.parse(backup);
    expect(result.fields![0].boundary).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
  });

  it('accepts null boundary', () => {
    const backup = {
      fields: [{
        id: 'f1', name: 'Test', farm_id: 'farm-1', acreage: 80, deleted_at: null,
        boundary: null,
      }],
    };
    const result = backupSchema.parse(backup);
    expect(result.fields![0].boundary).toBeNull();
  });

  it('rejects boundary with wrong type', () => {
    const backup = {
      fields: [{
        id: 'f1', name: 'Test', farm_id: 'farm-1', acreage: 80, deleted_at: null,
        boundary: { type: 'Point', coordinates: [0, 0] },
      }],
    };
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('rejects boundary with non-array coordinates', () => {
    const backup = {
      fields: [{
        id: 'f1', name: 'Test', farm_id: 'farm-1', acreage: 80, deleted_at: null,
        boundary: { type: 'Polygon', coordinates: 'invalid' },
      }],
    };
    expect(() => backupSchema.parse(backup)).toThrow();
  });
});

// ─── Spray product schema validation (fix #5) ─────────────────────────────────

describe('Backup schema spray product validation (fix #5)', () => {
  it('accepts valid spray products', () => {
    const backup = {
      sprayRecords: [{
        id: 's1', fieldId: 'f1', seasonYear: 2026, farm_id: 'farm-1', deleted_at: null,
        products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac' }],
      }],
    };
    const result = backupSchema.parse(backup);
    expect(result.sprayRecords![0].products).toHaveLength(1);
    expect(result.sprayRecords![0].products![0].product).toBe('Roundup');
  });

  it('rejects products with missing required fields', () => {
    const backup = {
      sprayRecords: [{
        id: 's1', fieldId: 'f1', seasonYear: 2026, farm_id: 'farm-1', deleted_at: null,
        products: [{ rate: '22', rateUnit: 'oz/ac' } as any], // missing 'product'
      }],
    };
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('rejects products with wrong type for rate', () => {
    const backup = {
      sprayRecords: [{
        id: 's1', fieldId: 'f1', seasonYear: 2026, farm_id: 'farm-1', deleted_at: null,
        products: [{ product: 'Roundup', rate: 22, rateUnit: 'oz/ac' } as any], // rate should be string
      }],
    };
    expect(() => backupSchema.parse(backup)).toThrow();
  });

  it('accepts products with optional epaRegNumber', () => {
    const backup = {
      sprayRecords: [{
        id: 's1', fieldId: 'f1', seasonYear: 2026, farm_id: 'farm-1', deleted_at: null,
        products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' }],
      }],
    };
    const result = backupSchema.parse(backup);
    expect(result.sprayRecords![0].products![0].epaRegNumber).toBe('524-549');
  });
});
