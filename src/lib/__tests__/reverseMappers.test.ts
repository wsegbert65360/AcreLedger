import { describe, it, expect } from 'vitest';
import {
  mapFieldToDb, mapPlantToDb, mapSprayToDb, mapHarvestToDb,
  mapHayToDb, mapGrainToDb, mapBinToDb, mapSeedToDb,
  mapRecipeToDb, mapFertilizerRecipeToDb, mapFertilizerToDb,
  mapTillageToDb, mapFsaTractToDb, mapFieldCluAssignmentToDb
} from '../mappers';
import type { Field, PlantRecord, SprayRecord, HarvestRecord,
  HayHarvestRecord, GrainMovement, Bin, SavedSeed, SprayRecipe,
  FertilizerRecipe, FertilizerApplication, TillageRecord } from '../../types/farm';
import type { FsaTractImport, FieldCluAssignment } from '../../types/fsaTract';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const farmId = 'farm-001';

function makeField(overrides?: Partial<Field>): Field {
  return {
    id: 'field-1',
    name: 'North 40',
    acreage: 80,
    lat: 35.5,
    lng: -90.2,
    farm_id: farmId,
    deleted_at: null,
    ...overrides,
  };
}

function makePlant(overrides?: Partial<PlantRecord>): PlantRecord {
  return {
    id: 'plant-1',
    fieldId: 'field-1',
    fieldName: 'North 40',
    seedVariety: 'DKC 64-35',
    acreage: 80,
    crop: 'Corn',
    plantDate: '2026-03-15',
    seasonYear: 2026,
    timestamp: Date.now(),
    farm_id: farmId,
    deleted_at: null,
    ...overrides,
  };
}


function makeFsaTract(overrides?: Partial<FsaTractImport>): FsaTractImport {
  return {
    id: 'tract-1',
    farmId,
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
    ...overrides,
  };
}

function makeCluAssignment(overrides?: Partial<FieldCluAssignment>): FieldCluAssignment {
  return {
    id: 'assignment-1',
    farmId,
    fieldId: 'field-1',
    tractKey: '6418-1417',
    cluNumber: '11',
    acres: 10.5,
    landUse: 'cropland',
    assignedAt: '2026-06-16T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// ─── Required Field Validation ──────────────────────────────────────────────────

describe('Reverse mapper required field validation', () => {
  it('mapFieldToDb throws on missing farm_id', () => {
    expect(() => mapFieldToDb({ id: '1', name: 'Test' } as any))
      .toThrow('[Mapper Error] mapFieldToDb: Missing required field "farm_id"');
  });

  it('mapFieldToDb throws on missing id', () => {
    expect(() => mapFieldToDb({ name: 'Test', farm_id: 'f1' } as any))
      .toThrow('[Mapper Error] mapFieldToDb: Missing required field "id"');
  });

  it('mapPlantToDb throws on missing seasonYear', () => {
    expect(() => mapPlantToDb({ id: '1', farm_id: 'f1', fieldId: 'fld1' } as any))
      .toThrow('[Mapper Error] mapPlantToDb: Missing required field "seasonYear"');
  });

  it('mapSprayToDb throws on missing fieldId', () => {
    expect(() => mapSprayToDb({ id: '1', farm_id: 'f1', seasonYear: 2026 } as any))
      .toThrow('[Mapper Error] mapSprayToDb: Missing required field "fieldId"');
  });

  it('mapHarvestToDb throws on missing seasonYear', () => {
    expect(() => mapHarvestToDb({ id: '1', farm_id: 'f1', fieldId: 'fld1' } as any))
      .toThrow('[Mapper Error] mapHarvestToDb: Missing required field "seasonYear"');
  });

  it('mapHayToDb throws on missing farm_id', () => {
    expect(() => mapHayToDb({ id: '1', fieldId: 'fld1', seasonYear: 2026 } as any))
      .toThrow('[Mapper Error] mapHayToDb: Missing required field "farm_id"');
  });

  it('mapGrainToDb throws on missing binId', () => {
    expect(() => mapGrainToDb({ id: '1', farm_id: 'f1', seasonYear: 2026 } as any))
      .toThrow('[Mapper Error] mapGrainToDb: Missing required field "binId"');
  });

  it('mapBinToDb throws on missing name', () => {
    expect(() => mapBinToDb({ id: '1', farm_id: 'f1' } as any))
      .toThrow('[Mapper Error] mapBinToDb: Missing required field "name"');
  });

  it('mapSeedToDb throws on missing farm_id', () => {
    expect(() => mapSeedToDb({ id: '1', name: 'Seed' } as any))
      .toThrow('[Mapper Error] mapSeedToDb: Missing required field "farm_id"');
  });

  it('mapRecipeToDb throws on missing name', () => {
    expect(() => mapRecipeToDb({ id: '1', farm_id: 'f1' } as any))
      .toThrow('[Mapper Error] mapRecipeToDb: Missing required field "name"');
  });

  it('mapFertilizerRecipeToDb throws on missing farm_id', () => {
    expect(() => mapFertilizerRecipeToDb({ id: '1', name: 'Recipe' } as any))
      .toThrow('[Mapper Error] mapFertilizerRecipeToDb: Missing required field "farm_id"');
  });

  it('mapFertilizerToDb throws on missing fieldId', () => {
    expect(() => mapFertilizerToDb({ id: '1', farm_id: 'f1', seasonYear: 2026 } as any))
      .toThrow('[Mapper Error] mapFertilizerToDb: Missing required field "fieldId"');
  });

  it('mapTillageToDb throws on missing farm_id', () => {
    expect(() => mapTillageToDb({ id: '1', fieldId: 'fld1', seasonYear: 2026 } as any))
      .toThrow('[Mapper Error] mapTillageToDb: Missing required field "farm_id"');
  });

  it('mapFsaTractToDb throws on missing farmId', () => {
    expect(() => mapFsaTractToDb({ id: 'tract-1', tractKey: '6418-1417' } as any))
      .toThrow('[Mapper Error] mapFsaTractToDb: Missing required field "farmId"');
  });

  it('mapFieldCluAssignmentToDb throws on missing fieldId', () => {
    expect(() => mapFieldCluAssignmentToDb({ id: 'assignment-1', farmId, tractKey: '6418-1417', cluNumber: '11', assignedAt: '2026-06-16T00:00:00.000Z' } as any))
      .toThrow('[Mapper Error] mapFieldCluAssignmentToDb: Missing required field "fieldId"');
  });
});

// ─── Zod Schema Validation (post-fix #1) ───────────────────────────────────────

describe('Reverse mapper Zod schema validation', () => {
  it('mapFieldToDb passes Zod validation for valid field', () => {
    const result = mapFieldToDb(makeField());
    expect(result).toBeDefined();
    expect(result.farm_id).toBe(farmId);
    expect(result.name).toBe('North 40');
  });

  it('mapPlantToDb passes Zod validation for valid plant record', () => {
    const result = mapPlantToDb(makePlant({
      cropStatus: 'Cover Crop',
      plantingPattern: 'Double crop',
    }));
    expect(result).toBeDefined();
    expect(result.farm_id).toBe(farmId);
    expect(result.season_year).toBe(2026);
    expect(result.field_id).toBe('field-1');
    expect(result.crop_status).toBe('Cover Crop');
    expect(result.planting_pattern).toBe('Double crop');
    expect(result.deleted_at).toBeNull();
  });

  it('mapSprayToDb passes Zod validation for valid spray record', () => {
    const spray: SprayRecord = {
      id: 'spray-1',
      fieldId: 'field-1',
      fieldName: 'North 40',
      products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac' }],
      windSpeed: 5,
      temperature: 75,
      sprayDate: '2026-04-01',
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    };
    const result = mapSprayToDb(spray);
    expect(result).toBeDefined();
    expect(result.farm_id).toBe(farmId);
    expect(result.products).toEqual([{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac' }]);
  });

  it('mapSprayToDb throws Zod error for type mismatch on seasonYear', () => {
    const spray: any = {
      id: 'spray-1',
      fieldId: 'field-1',
      farm_id: farmId,
      seasonYear: 'not-a-number',
    };
    expect(() => mapSprayToDb(spray)).toThrow();
  });

  it('mapHarvestToDb passes Zod validation for valid harvest record', () => {
    const harvest: HarvestRecord = {
      id: 'harvest-1',
      fieldId: 'field-1',
      fieldName: 'North 40',
      bushels: 150,
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    };
    const result = mapHarvestToDb(harvest);
    expect(result).toBeDefined();
    expect(result.bushels).toBe(150);
  });

  it('mapGrainToDb passes Zod validation for valid grain movement', () => {
    const grain: GrainMovement = {
      id: 'gm-1',
      binId: 'bin-1',
      binName: 'Main Bin',
      type: 'in',
      bushels: 1000,
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    };
    const result = mapGrainToDb(grain);
    expect(result).toBeDefined();
    expect(result.bushels).toBe(1000);
  });

  it('mapGrainToDb handles negative bushels (estimate correction)', () => {
    const grain: GrainMovement = {
      id: 'gm-1',
      binId: 'bin-1',
      type: 'out',
      bushels: -50,
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    };
    const result = mapGrainToDb(grain);
    expect(result.bushels).toBe(-50);
  });

  it('mapFsaTractToDb passes Zod validation for valid CLU tract import', () => {
    const result = mapFsaTractToDb(makeFsaTract());
    expect(result.farm_id).toBe(farmId);
    expect(result.tract_key).toBe('6418-1417');
    expect(result.feature_count).toBe(1);
    expect(result.deleted_at).toBeNull();
  });

  it('mapFieldCluAssignmentToDb passes Zod validation for valid CLU assignment', () => {
    const result = mapFieldCluAssignmentToDb(makeCluAssignment({ landUse: 'non_cropland' }));
    expect(result.farm_id).toBe(farmId);
    expect(result.field_id).toBe('field-1');
    expect(result.clu_number).toBe('11');
    expect(result.land_use).toBe('non_cropland');
  });
});

// ─── Database Output Keys ──────────────────────────────────────────────────────

describe('Reverse mapper output keys', () => {
  it('mapFieldToDb outputs snake_case database keys', () => {
    const result = mapFieldToDb(makeField({
      fsaFarmNumber: '123',
      irrigationPractice: 'Irrigated',
      cluNumbers: ['11', '14'],
    }));
    const keys = Object.keys(result);
    expect(keys).toContain('fsa_farm_number');
    expect(keys).toContain('irrigation_practice');
    expect(keys).toContain('clu_numbers');
    expect(keys).toContain('farm_id');
    expect(keys).toContain('deleted_at');
    expect(keys).not.toContain('fsaFarmNumber');
    expect(keys).not.toContain('cluNumbers');
    expect(result.clu_numbers).toEqual(['11', '14']);
  });

  it('mapPlantToDb outputs snake_case keys', () => {
    const result = mapPlantToDb(makePlant());
    const keys = Object.keys(result);
    expect(keys).toContain('field_id');
    expect(keys).toContain('seed_variety');
    expect(keys).toContain('season_year');
    expect(keys).not.toContain('fieldId');
    expect(keys).not.toContain('seedVariety');
  });

  it('mapFsaTractToDb outputs snake_case database keys', () => {
    const result = mapFsaTractToDb(makeFsaTract());
    const keys = Object.keys(result);
    expect(keys).toContain('farm_id');
    expect(keys).toContain('tract_key');
    expect(keys).toContain('feature_count');
    expect(keys).toContain('imported_at');
    expect(keys).not.toContain('farmId');
    expect(keys).not.toContain('tractKey');
  });

  it('mapFieldCluAssignmentToDb outputs snake_case database keys', () => {
    const result = mapFieldCluAssignmentToDb(makeCluAssignment());
    const keys = Object.keys(result);
    expect(keys).toContain('farm_id');
    expect(keys).toContain('field_id');
    expect(keys).toContain('tract_key');
    expect(keys).toContain('clu_number');
    expect(keys).toContain('land_use');
    expect(keys).not.toContain('farmId');
    expect(keys).not.toContain('fieldId');
  });

  it('mapSprayToDb outputs snake_case keys', () => {
    const result = mapSprayToDb({
      id: 'spray-1',
      fieldId: 'field-1',
      farm_id: farmId,
      seasonYear: 2026,
      deleted_at: null,
    } as SprayRecord);
    const keys = Object.keys(result);
    expect(keys).toContain('field_id');
    expect(keys).toContain('season_year');
    expect(keys).toContain('wind_speed');
    expect(keys).toContain('epa_reg_number');
  });

  it('mapTillageToDb outputs snake_case keys', () => {
    const tillage: TillageRecord = {
      id: 'till-1',
      fieldId: 'field-1',
      fieldName: 'North 40',
      implementType: 'Disk',
      date: '2026-03-10',
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    };
    const result = mapTillageToDb(tillage);
    const keys = Object.keys(result);
    expect(keys).toContain('implement_type');
    expect(keys).toContain('field_id');
  });
});

// ─── Optional Fields as null ───────────────────────────────────────────────────

describe('Reverse mapper optional fields', () => {
  it('mapFieldToDb passes through boundary as-is', () => {
    const boundary = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const result = mapFieldToDb(makeField({ boundary }));
    expect(result.boundary).toEqual(boundary);
  });

  it('mapFieldToDb handles null boundary', () => {
    const result = mapFieldToDb(makeField({ boundary: null }));
    expect(result.boundary).toBeNull();
  });

  it('mapFieldToDb converts undefined boundary to null', () => {
    const result = mapFieldToDb(makeField({ boundary: undefined }));
    expect(result.boundary).toBeNull();
  });

  it('mapSprayToDb converts undefined optional fields to null or defaults', () => {
    const result = mapSprayToDb({
      id: 'spray-1',
      fieldId: 'field-1',
      farm_id: farmId,
      seasonYear: 2026,
      deleted_at: null,
    } as SprayRecord);
    expect(result.spray_date).toBeNull();
    expect(result.start_time).toBeNull();
    expect(result.end_time).toBeNull();
    expect(result.wind_speed).toBe(0);
    expect(result.temperature).toBe(0);
  });

  it('mapGrainToDb handles optional price field', () => {
    const result = mapGrainToDb({
      id: 'gm-1',
      binId: 'bin-1',
      bushels: 100,
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    } as GrainMovement);
    expect(result.price).toBeUndefined();
  });

  it('mapGrainToDb handles zero price', () => {
    const result = mapGrainToDb({
      id: 'gm-1',
      binId: 'bin-1',
      bushels: 100,
      price: 0,
      seasonYear: 2026,
      timestamp: Date.now(),
      farm_id: farmId,
      deleted_at: null,
    });
    expect(result.price).toBe(0);
  });
});

// ─── Timestamp Handling ──────────────────────────────────────────────────────────

describe('Reverse mapper timestamp handling', () => {
  it('mapPlantToDb converts timestamp to ISO string', () => {
    const ts = 1700000000000;
    const result = mapPlantToDb(makePlant({ timestamp: ts }));
    expect(typeof result.timestamp).toBe('string');
    expect(new Date(result.timestamp).getTime()).toBe(ts);
  });

  it('mapPlantToDb generates current timestamp when missing', () => {
    const result = mapPlantToDb(makePlant({ timestamp: undefined }));
    expect(typeof result.timestamp).toBe('string');
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it('mapSprayToDb converts timestamp to ISO string', () => {
    const ts = 1700000000000;
    const result = mapSprayToDb({
      id: 'spray-1',
      fieldId: 'field-1',
      farm_id: farmId,
      timestamp: ts,
      seasonYear: 2026,
      deleted_at: null,
    } as SprayRecord);
    expect(new Date(result.timestamp).getTime()).toBe(ts);
  });

  it('mapBinToDb passes through deleted_at', () => {
    const result = mapBinToDb({
      id: 'bin-1',
      name: 'Main Bin',
      capacity: 5000,
      farm_id: farmId,
      deleted_at: '2026-01-01T00:00:00.000Z',
    });
    expect(result.deleted_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ─── Product Array Handling ────────────────────────────────────────────────────

describe('Reverse mapper product array handling', () => {
  it('mapSprayToDb passes empty products array', () => {
    const result = mapSprayToDb({
      id: 'spray-1',
      fieldId: 'field-1',
      farm_id: farmId,
      seasonYear: 2026,
      products: [],
      deleted_at: null,
    } as SprayRecord);
    expect(result.products).toEqual([]);
  });

  it('mapSprayToDb passes products with all fields', () => {
    const products = [
      { product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549', activeIngredients: 'Glyphosate' },
    ];
    const result = mapSprayToDb({
      id: 'spray-1',
      fieldId: 'field-1',
      farm_id: farmId,
      seasonYear: 2026,
      products,
      deleted_at: null,
    } as SprayRecord);
    expect(result.products).toEqual(products);
  });
});
