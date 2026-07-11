import { describe, test, expect } from 'vitest';
import {
  generateLandlordSummary,
  generateLandlordSummaryCSV,
  getFieldLandlordNames,
} from './generateLandlordSummary';
import type {
  CustomSprayRecord,
  FertilizerApplication,
  Field,
  HarvestRecord,
  PlantRecord,
  SprayRecord,
  TillageRecord,
} from '@/types/farm';

const fields: Field[] = [
  { id: 'f1', name: 'North 40', acreage: 40, lat: null, lng: null, landlordName: 'John Smith', farm_id: 'farm1', deleted_at: null },
  { id: 'f2', name: 'South Field', acreage: 60, lat: null, lng: null, landlordName: 'John Smith', farm_id: 'farm1', deleted_at: null },
  { id: 'f3', name: 'East Quarter', acreage: 100, lat: null, lng: null, landlordName: 'Mary Jones', farm_id: 'farm1', deleted_at: null },
  { id: 'f4', name: 'No-Landlord Field', acreage: 50, lat: null, lng: null, farm_id: 'farm1', deleted_at: null },
  // soft-deleted — must be excluded
  { id: 'f5', name: 'Deleted', acreage: 10, lat: null, lng: null, landlordName: 'John Smith', farm_id: 'farm1', deleted_at: '2026-01-01' },
];

const plantRecords: PlantRecord[] = [
  { id: 'p1', fieldId: 'f1', fieldName: 'North 40', seedVariety: 'Pioneer 1197', acreage: 40, crop: 'Corn', plantDate: '2026-04-15', timestamp: 1, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
  { id: 'p2', fieldId: 'f2', fieldName: 'South Field', seedVariety: 'Asgrow 23X4', acreage: 60, crop: 'Soybeans', plantDate: '2026-05-01', timestamp: 2, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
];

const sprayRecords: SprayRecord[] = [
  { id: 's1', fieldId: 'f1', fieldName: 'North 40', products: [{ ui_id: 'x', product: 'Roundup', rate: '32', rateUnit: 'oz/ac' }], windSpeed: 8, temperature: 72, sprayDate: '2026-05-20', timestamp: 3, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
];

const fertilizerApplications: FertilizerApplication[] = [
  { id: 'fa1', fieldId: 'f1', fieldName: 'North 40', date: '2026-03-10', acres: 40, fertilizer_formula: '10-10-10', timestamp: 0, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
];

const tillageRecords: TillageRecord[] = [
  { id: 't1', fieldId: 'f2', fieldName: 'South Field', date: '2026-04-02', implementType: 'Field Cultivator', seasonYear: 2026, timestamp: 0, farm_id: 'farm1', deleted_at: null },
];

const customSprayRecords: CustomSprayRecord[] = [
  { id: 'cs1', fieldId: 'f1', fieldName: 'North 40', date: '2026-06-01', applicator: 'Local Co-op', recipe: 'Glyphosate 1qt/ac', seasonYear: 2026, timestamp: 4, farm_id: 'farm1', deleted_at: null },
];

const harvestRecords: HarvestRecord[] = [
  // North 40 (40 ac): 4000 bu @ 25% landlord split => 1000 landlord bu, 100 bu/ac
  { id: 'h1', fieldId: 'f1', fieldName: 'North 40', destination: 'bin', moisturePercent: 15, landlordSplitPercent: 25, bushels: 4000, crop: 'Corn', harvestDate: '2026-10-01', timestamp: 5, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
  // South Field (60 ac): 6000 bu @ 0% => 0 landlord bu, 100 bu/ac
  { id: 'h2', fieldId: 'f2', fieldName: 'South Field', destination: 'bin', moisturePercent: 13, landlordSplitPercent: 0, bushels: 6000, crop: 'Soybeans', harvestDate: '2026-10-10', timestamp: 6, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
  // East Quarter belongs to Mary Jones — excluded from John's summary.
  { id: 'h3', fieldId: 'f3', fieldName: 'East Quarter', destination: 'bin', moisturePercent: 14, landlordSplitPercent: 33, bushels: 9000, crop: 'Corn', harvestDate: '2026-10-05', timestamp: 7, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
];

const baseParams = {
  fields,
  cluAssignments: [],
  plantRecords,
  sprayRecords,
  customSprayRecords,
  fertilizerApplications,
  tillageRecords,
  harvestRecords,
  seasonYear: 2026,
};

describe('getFieldLandlordNames', () => {
  test('returns sorted, deduped landlord names from fields; excludes undefined and soft-deleted', () => {
    expect(getFieldLandlordNames(fields)).toEqual(['John Smith', 'Mary Jones']);
  });

  test('excludes a landlord whose only fields are all soft-deleted', () => {
    // Ghost Tenant only owns the soft-deleted field f5.
    const ghostFields: Field[] = [
      { id: 'f5', name: 'Deleted', acreage: 10, lat: null, lng: null, landlordName: 'Ghost Tenant', farm_id: 'farm1', deleted_at: '2026-01-01' },
    ];
    expect(getFieldLandlordNames(ghostFields)).toEqual([]);
  });
});

describe('generateLandlordSummary', () => {
  test('groups only the selected landlord\'s active fields', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const fieldNames = summary.fields.map(f => f.fieldName).sort();
    expect(fieldNames).toEqual(['North 40', 'South Field']);
    // East Quarter (Mary) and No-Landlord and Deleted excluded
    expect(summary.fields.find(f => f.fieldName === 'East Quarter')).toBeUndefined();
    expect(summary.fields.find(f => f.fieldName === 'Deleted')).toBeUndefined();
  });

  test('case-insensitive landlord match', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'john smith' });
    expect(summary.fields).toHaveLength(2);
  });

  test('computes bushels, bu/acre, and landlord share per field', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const north = summary.fields.find(f => f.fieldName === 'North 40')!;
    expect(north.totalBushels).toBe(4000);
    expect(north.buPerAcre).toBe(100); // 4000 / 40
    expect(north.landlordShareBushels).toBe(1000); // 4000 * 0.25
    const south = summary.fields.find(f => f.fieldName === 'South Field')!;
    expect(south.totalBushels).toBe(6000);
    expect(south.buPerAcre).toBe(100); // 6000 / 60
    expect(south.landlordShareBushels).toBe(0);
  });

  test('aggregates totals across fields', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    expect(summary.totals.acres).toBe(100); // 40 + 60
    expect(summary.totals.totalBushels).toBe(10000); // 4000 + 6000
    expect(summary.totals.landlordShareBushels).toBe(1000);
  });

  test('bu/acre is null when field has no acreage', () => {
    const noAcreFields: Field[] = [{ id: 'f1', name: 'Zero', acreage: 0, lat: null, lng: null, landlordName: 'John Smith', farm_id: 'farm1', deleted_at: null }];
    const summary = generateLandlordSummary({
      ...baseParams,
      landlordName: 'John Smith',
      fields: noAcreFields,
      harvestRecords: [{ id: 'h1', fieldId: 'f1', fieldName: 'Zero', destination: 'bin', moisturePercent: 15, landlordSplitPercent: 50, bushels: 500, harvestDate: '2026-10-01', timestamp: 5, seasonYear: 2026, farm_id: 'farm1', deleted_at: null }],
    });
    expect(summary.fields[0].buPerAcre).toBeNull();
    expect(summary.fields[0].totalBushels).toBe(500);
  });

  test('aggregates activity across types and sorts by date ascending', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    // John's fields are f1 (North 40) and f2 (South Field) — both owned by John.
    // Expected activity (chronological):
    //  2026-03-10 fertilizer (f1)
    //  2026-04-02 tillage (f2)
    //  2026-04-15 plant (f1)
    //  2026-05-01 plant (f2)
    //  2026-05-20 spray (f1)
    //  2026-06-01 customSpray (f1)
    //  2026-10-01 harvest (f1)
    //  2026-10-10 harvest (f2)
    const types = summary.activity.map(a => a.activityType);
    expect(types).toEqual(['fertilizer', 'tillage', 'plant', 'plant', 'spray', 'customSpray', 'harvest', 'harvest']);
    // Verify sort keys are monotonic
    const keys = summary.activity.map(a => a.sortKey);
    const sorted = [...keys].sort((a, b) => a - b);
    expect(keys).toEqual(sorted);
    // Verify activity only references the landlord's fields
    expect(summary.activity.every(a => a.fieldName === 'North 40' || a.fieldName === 'South Field')).toBe(true);
  });

  test('harvest activity detail includes bushels', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const harvestRows = summary.activity.filter(a => a.activityType === 'harvest');
    expect(harvestRows.find(r => r.fieldName === 'North 40')!.detail).toBe('4,000 bu');
  });

  test('returns empty fields and activity for unknown landlord', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'Nobody' });
    expect(summary.fields).toHaveLength(0);
    expect(summary.activity).toHaveLength(0);
    expect(summary.totals.totalBushels).toBe(0);
    expect(summary.totals.acres).toBe(0);
  });

  test('activity excludes records for the landlord\'s soft-deleted field', () => {
    // Add a harvest on the deleted field f5; it should not appear.
    const summary = generateLandlordSummary({
      ...baseParams,
      landlordName: 'John Smith',
      harvestRecords: [
        ...harvestRecords,
        { id: 'h-del', fieldId: 'f5', fieldName: 'Deleted', destination: 'bin', moisturePercent: 15, landlordSplitPercent: 50, bushels: 9999, harvestDate: '2026-10-01', timestamp: 8, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
      ],
    });
    // f5 is soft-deleted so its harvest must not count toward John's totals.
    expect(summary.totals.totalBushels).toBe(10000);
    expect(summary.activity.find(a => a.fieldName === 'Deleted')).toBeUndefined();
  });
});

describe('generateLandlordSummaryCSV', () => {
  test('contains headers, per-field rows, and a TOTAL row', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const csv = generateLandlordSummaryCSV(summary);
    expect(csv).toContain('Field');
    expect(csv).toContain('Crop');
    expect(csv).toContain('Bu/Acre');
    expect(csv).toContain('North 40');
    expect(csv).toContain('Corn');
    expect(csv).toContain('TOTAL');
    // landlord share total (1000) should be present
    expect(csv).toContain('1000');
  });

  test('weighted-average bu/acre in totals row when acres > 0', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const csv = generateLandlordSummaryCSV(summary);
    // 10000 bu / 100 ac = 100 bu/ac overall
    expect(csv).toContain('100');
  });
});
