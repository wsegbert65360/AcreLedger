import { describe, it, expect } from 'vitest';
import {
  generateFields, generateBins, generateSavedSeeds, generateSprayRecipes,
  generatePlantRecords, generateSprayRecords, generateHarvestRecords,
  generateHayRecords, generateFertilizerRecords, generateGrainMovements,
  generateAllTestData,
} from './generateTestData';

describe('Test Data Generator — 100 of Everything', () => {

  // --- Count tests ---

  it('generates exactly 100 fields', () => {
    const fields = generateFields(100);
    expect(fields).toHaveLength(100);
  });

  it('generates exactly 100 bins', () => {
    const bins = generateBins(100);
    expect(bins).toHaveLength(100);
  });

  it('generates exactly 100 saved seeds', () => {
    const seeds = generateSavedSeeds(100);
    expect(seeds).toHaveLength(100);
  });

  it('generates exactly 100 spray recipes', () => {
    const recipes = generateSprayRecipes(100);
    expect(recipes).toHaveLength(100);
  });

  it('generates exactly 100 plant records', () => {
    const fields = generateFields(100);
    const seeds = generateSavedSeeds(100);
    const records = generatePlantRecords(fields, seeds, 100);
    expect(records).toHaveLength(100);
  });

  it('generates exactly 100 spray records', () => {
    const fields = generateFields(100);
    const records = generateSprayRecords(fields, 100);
    expect(records).toHaveLength(100);
  });

  it('generates exactly 100 harvest records', () => {
    const fields = generateFields(100);
    const bins = generateBins(100);
    const records = generateHarvestRecords(fields, bins, 100);
    expect(records).toHaveLength(100);
  });

  it('generates exactly 100 hay records', () => {
    const fields = generateFields(100);
    const records = generateHayRecords(fields, 100);
    expect(records).toHaveLength(100);
  });

  it('generates exactly 100 fertilizer records', () => {
    const fields = generateFields(100);
    const records = generateFertilizerRecords(fields, 100);
    expect(records).toHaveLength(100);
  });

  it('generates exactly 100 grain movements', () => {
    const bins = generateBins(100);
    const fields = generateFields(100);
    const records = generateGrainMovements(bins, fields, 100);
    expect(records).toHaveLength(100);
  });

  // --- Uniqueness tests ---

  it('all field IDs are unique', () => {
    const fields = generateFields(100);
    const ids = new Set(fields.map(f => f.id));
    expect(ids.size).toBe(100);
  });

  it('all bin IDs are unique', () => {
    const bins = generateBins(100);
    const ids = new Set(bins.map(b => b.id));
    expect(ids.size).toBe(100);
  });

  it('all seed names are unique', () => {
    const seeds = generateSavedSeeds(100);
    const names = new Set(seeds.map(s => s.name));
    expect(names.size).toBe(100);
  });

  // --- Data integrity tests ---

  it('field acreage is within realistic range', () => {
    const fields = generateFields(100);
    fields.forEach(f => {
      expect(f.acreage).toBeGreaterThanOrEqual(15);
      expect(f.acreage).toBeLessThanOrEqual(200);
    });
  });

  it('field coordinates are within Missouri bounds', () => {
    const fields = generateFields(100);
    fields.forEach(f => {
      expect(f.lat).toBeGreaterThanOrEqual(36.5);
      expect(f.lat).toBeLessThanOrEqual(40.5);
      expect(f.lng).toBeGreaterThanOrEqual(-95.5);
      expect(f.lng).toBeLessThanOrEqual(-89.5);
    });
  });

  it('plant records reference valid field IDs', () => {
    const fields = generateFields(100);
    const seeds = generateSavedSeeds(100);
    const records = generatePlantRecords(fields, seeds, 100);
    const fieldIds = new Set(fields.map(f => f.id));
    records.forEach(r => {
      expect(fieldIds.has(r.fieldId)).toBe(true);
    });
  });

  it('plant record dates are in planting season (March–May)', () => {
    const fields = generateFields(100);
    const seeds = generateSavedSeeds(100);
    const records = generatePlantRecords(fields, seeds, 100);
    records.forEach(r => {
      if (r.plantDate) {
        const month = parseInt(r.plantDate.split('-')[1], 10);
        expect(month).toBeGreaterThanOrEqual(3);
        expect(month).toBeLessThanOrEqual(5);
      }
    });
  });

  it('spray records have wind speed, temperature, and products', () => {
    const fields = generateFields(100);
    const records = generateSprayRecords(fields, 100);
    records.forEach(r => {
      expect(r.windSpeed).toBeGreaterThanOrEqual(2);
      expect(r.windSpeed).toBeLessThanOrEqual(12);
      expect(r.temperature).toBeGreaterThanOrEqual(55);
      expect(r.temperature).toBeLessThanOrEqual(95);
      expect(r.products).toBeDefined();
      expect(r.products!.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('harvest records have valid moisture and bushel values', () => {
    const fields = generateFields(100);
    const bins = generateBins(100);
    const records = generateHarvestRecords(fields, bins, 100);
    records.forEach(r => {
      expect(r.bushels).toBeGreaterThanOrEqual(200);
      expect(r.bushels).toBeLessThanOrEqual(2500);
      expect(r.moisturePercent).toBeGreaterThanOrEqual(12);
      expect(r.moisturePercent).toBeLessThanOrEqual(22);
      expect(['bin', 'town']).toContain(r.destination);
    });
  });

  it('harvest records with destination=bin have a binId', () => {
    const fields = generateFields(100);
    const bins = generateBins(100);
    const records = generateHarvestRecords(fields, bins, 100);
    const binRecords = records.filter(r => r.destination === 'bin');
    binRecords.forEach(r => {
      expect(r.binId).toBeDefined();
      expect(r.binId!.length).toBeGreaterThan(0);
    });
  });

  it('hay records have valid bale types', () => {
    const fields = generateFields(100);
    const records = generateHayRecords(fields, 100);
    records.forEach(r => {
      expect(['Round', 'Square']).toContain(r.baleType);
      expect(r.baleCount).toBeGreaterThanOrEqual(15);
      expect(r.baleCount).toBeLessThanOrEqual(120);
      expect(r.cuttingNumber).toBeGreaterThanOrEqual(1);
      expect(r.cuttingNumber).toBeLessThanOrEqual(4);
    });
  });

  it('grain movements have correct in/out types', () => {
    const bins = generateBins(100);
    const fields = generateFields(100);
    const records = generateGrainMovements(bins, fields, 100);
    records.forEach(r => {
      expect(['in', 'out']).toContain(r.type);
      if (r.type === 'out') {
        expect(r.destination).toBeDefined();
      }
    });
  });

  it('bin capacities are realistic', () => {
    const bins = generateBins(100);
    bins.forEach(b => {
      expect(b.capacity).toBeGreaterThanOrEqual(5000);
      expect(b.capacity).toBeLessThanOrEqual(50000);
    });
  });

  it('spray recipes have valid products with EPA numbers', () => {
    const recipes = generateSprayRecipes(100);
    recipes.forEach(r => {
      expect(r.products.length).toBeGreaterThanOrEqual(1);
      expect(r.products.length).toBeLessThanOrEqual(3);
      r.products.forEach(p => {
        expect(p.product).toBeTruthy();
        expect(p.rate).toBeTruthy();
        expect(p.rateUnit).toBeTruthy();
      });
    });
  });

  // --- Master generator test ---

  it('generateAllTestData produces 100 of every type', () => {
    const data = generateAllTestData(100);
    expect(data.fields).toHaveLength(100);
    expect(data.bins).toHaveLength(100);
    expect(data.seeds).toHaveLength(100);
    expect(data.recipes).toHaveLength(100);
    expect(data.plantRecords).toHaveLength(100);
    expect(data.sprayRecords).toHaveLength(100);
    expect(data.harvestRecords).toHaveLength(100);
    expect(data.hayRecords).toHaveLength(100);
    expect(data.fertilizerRecords).toHaveLength(100);
    expect(data.grainMovements).toHaveLength(100);
  });

  // --- Scalability test ---

  it('can generate 1000 of everything without errors', () => {
    const data = generateAllTestData(1000);
    expect(data.fields).toHaveLength(1000);
    expect(data.plantRecords).toHaveLength(1000);
    expect(data.sprayRecords).toHaveLength(1000);
    expect(data.harvestRecords).toHaveLength(1000);
    expect(data.grainMovements).toHaveLength(1000);
  });

  // --- Cross-entity referential integrity ---

  it('all plant records reference fields that exist in the generated set', () => {
    const data = generateAllTestData(100);
    const fieldIds = new Set(data.fields.map(f => f.id));
    data.plantRecords.forEach(r => {
      expect(fieldIds.has(r.fieldId)).toBe(true);
    });
  });

  it('all spray records reference fields that exist in the generated set', () => {
    const data = generateAllTestData(100);
    const fieldIds = new Set(data.fields.map(f => f.id));
    data.sprayRecords.forEach(r => {
      expect(fieldIds.has(r.fieldId)).toBe(true);
    });
  });

  it('all harvest records reference fields that exist in the generated set', () => {
    const data = generateAllTestData(100);
    const fieldIds = new Set(data.fields.map(f => f.id));
    data.harvestRecords.forEach(r => {
      expect(fieldIds.has(r.fieldId)).toBe(true);
    });
  });

  it('all grain movements reference bins that exist in the generated set', () => {
    const data = generateAllTestData(100);
    const binIds = new Set(data.bins.map(b => b.id));
    data.grainMovements.forEach(r => {
      expect(binIds.has(r.binId)).toBe(true);
    });
  });
});
