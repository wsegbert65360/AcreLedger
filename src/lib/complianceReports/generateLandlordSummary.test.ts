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
  HayHarvestRecord,
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

const hayHarvestRecords: HayHarvestRecord[] = [
  { id: 'hh1', fieldId: 'f1', fieldName: 'North 40', date: '2026-07-15', baleCount: 80, cuttingNumber: 1, baleType: 'Round', timestamp: 5, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
  { id: 'hh2', fieldId: 'f1', fieldName: 'North 40', date: '2026-08-20', baleCount: 45, cuttingNumber: 2, baleType: 'Square', timestamp: 6, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
  { id: 'hh3', fieldId: 'f3', fieldName: 'East Quarter', date: '2026-07-20', baleCount: 200, cuttingNumber: 1, baleType: 'Round', timestamp: 7, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
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
  hayHarvestRecords,
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
    const fieldNames = [...new Set(summary.fields.map(f => f.fieldName))].sort();
    expect(fieldNames).toEqual(['North 40', 'South Field']);
    // East Quarter (Mary) and No-Landlord and Deleted excluded
    expect(summary.fields.find(f => f.fieldName === 'East Quarter')).toBeUndefined();
    expect(summary.fields.find(f => f.fieldName === 'Deleted')).toBeUndefined();
  });

  test('case-insensitive landlord match', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'john smith' });
    expect(new Set(summary.fields.map(f => f.fieldId)).size).toBe(2);
  });

  test('computes bushels, bu/acre, and landlord share per field and crop', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    // North 40 has corn and hay, so it gets one row per crop.
    const north = summary.fields.find(f => f.fieldName === 'North 40' && f.crop === 'Corn')!;
    expect(north.totalBushels).toBe(4000);
    expect(north.buPerAcre).toBe(100); // 4000 / 40
    expect(north.totalBales).toBe(0);
    expect(north.landlordShareBushels).toBe(1000); // 4000 * 0.25
    const northHay = summary.fields.find(f => f.fieldName === 'North 40' && f.crop === 'Hay')!;
    expect(northHay.totalBales).toBe(125);
    expect(northHay.totalBushels).toBe(0);
    expect(northHay.buPerAcre).toBeNull();
    const south = summary.fields.find(f => f.fieldName === 'South Field')!;
    expect(south.totalBushels).toBe(6000);
    expect(south.buPerAcre).toBe(100); // 6000 / 60
    expect(south.totalBales).toBe(0);
    expect(south.landlordShareBushels).toBe(0);
  });

  test('totals acres once per field and bushels per crop, never across crops', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    expect(summary.totals.acres).toBe(100); // 40 + 60, North 40 counted once despite two rows
    expect(summary.totals.totalBales).toBe(125); // excludes Mary Jones's 200 bales
    expect(summary.cropTotals).toEqual([
      { crop: 'Corn', acres: 40, totalBushels: 4000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 1000 },
      { crop: 'Soybeans', acres: 60, totalBushels: 6000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 0 },
      { crop: 'Hay', acres: 40, totalBushels: 0, buPerAcre: null, totalBales: 125, landlordShareBushels: 0 },
    ]);
  });

  test('a field with two grain crops gets one row per crop with its own bu/acre', () => {
    const summary = generateLandlordSummary({
      ...baseParams,
      landlordName: 'John Smith',
      harvestRecords: [
        { id: 'w1', fieldId: 'f2', fieldName: 'South Field', destination: 'bin', moisturePercent: 14, landlordSplitPercent: 50, bushels: 3000, crop: 'Wheat', harvestDate: '2026-07-01', timestamp: 1, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
        { id: 'w2', fieldId: 'f2', fieldName: 'South Field', destination: 'bin', moisturePercent: 14, landlordSplitPercent: 50, bushels: 1800, crop: 'Soybeans', harvestDate: '2026-11-01', timestamp: 2, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
      ],
    });
    const south = summary.fields.filter(f => f.fieldName === 'South Field');
    expect(south.map(f => f.crop)).toEqual(['Soybeans', 'Wheat']);
    expect(south.find(f => f.crop === 'Wheat')).toMatchObject({ totalBushels: 3000, buPerAcre: 50, landlordShareBushels: 1500 });
    expect(south.find(f => f.crop === 'Soybeans')).toMatchObject({ totalBushels: 1800, buPerAcre: 30, landlordShareBushels: 900 });
  });

  test('a harvest with no crop falls back to the field\'s planted crop', () => {
    const summary = generateLandlordSummary({
      ...baseParams,
      landlordName: 'John Smith',
      hayHarvestRecords: [],
      harvestRecords: [
        { id: 'h-nocrop', fieldId: 'f1', fieldName: 'North 40', destination: 'bin', moisturePercent: 15, landlordSplitPercent: 25, bushels: 400, harvestDate: '2026-10-01', timestamp: 5, seasonYear: 2026, farm_id: 'farm1', deleted_at: null },
      ],
    });
    const north = summary.fields.filter(f => f.fieldName === 'North 40');
    expect(north).toHaveLength(1);
    expect(north[0].crop).toBe('Corn'); // from plant record p1
    expect(north[0].totalBushels).toBe(400);
  });

  test('counts harvests on the landlord\'s fields that have no crop-share percent', () => {
    const noShare = { ...harvestRecords[0], id: 'h-noshare', landlordSplitPercent: undefined } as unknown as HarvestRecord;
    const summary = generateLandlordSummary({
      ...baseParams,
      landlordName: 'John Smith',
      harvestRecords: [...harvestRecords, noShare],
    });
    expect(summary.missingShareHarvests).toBe(1);
    // Mary Jones's harvest never counts toward John's summary.
    const clean = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    expect(clean.missingShareHarvests).toBe(0);
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
    expect(summary.cropTotals[0].buPerAcre).toBeNull(); // crop falls back to the planted crop; no acreage, no yield
  });

  test('different crops on one field stay on separate rows instead of blending', () => {
    const summary = generateLandlordSummary({
      ...baseParams,
      landlordName: 'John Smith',
      harvestRecords: [
        {
          id: 'h-dated',
          fieldId: 'f1',
          fieldName: 'North 40',
          destination: 'bin',
          moisturePercent: 15,
          landlordSplitPercent: 25,
          bushels: 100,
          crop: 'Corn',
          harvestDate: '2026-10-11',
          timestamp: new Date(2026, 9, 10, 20, 0).getTime(),
          seasonYear: 2026,
          farm_id: 'farm1',
          deleted_at: null,
        },
        {
          id: 'h-stamp',
          fieldId: 'f1',
          fieldName: 'North 40',
          destination: 'bin',
          moisturePercent: 15,
          landlordSplitPercent: 25,
          bushels: 50,
          crop: 'Soybeans',
          timestamp: new Date(2026, 9, 10, 21, 0).getTime(),
          seasonYear: 2026,
          farm_id: 'farm1',
          deleted_at: null,
        },
      ],
    });
    const north = summary.fields.filter(f => f.fieldName === 'North 40' && f.totalBushels > 0);
    expect(north.map(f => [f.crop, f.totalBushels])).toEqual([['Corn', 100], ['Soybeans', 50]]);
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
    //  2026-07-15 hay cutting 1 (f1)
    //  2026-08-20 hay cutting 2 (f1)
    //  2026-10-01 harvest (f1)
    //  2026-10-10 harvest (f2)
    const types = summary.activity.map(a => a.activityType);
    expect(types).toEqual(['fertilizer', 'tillage', 'plant', 'plant', 'spray', 'customSpray', 'hay', 'hay', 'harvest', 'harvest']);
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

  test('hay activity identifies bale type, count, and cutting', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const hayRows = summary.activity.filter(a => a.activityType === 'hay');
    expect(hayRows).toHaveLength(2);
    expect(hayRows[0].detail).toBe('80 round bales · Cutting 1');
    expect(hayRows[1].detail).toBe('45 square bales · Cutting 2');
  });

  test('returns empty fields and activity for unknown landlord', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'Nobody' });
    expect(summary.fields).toHaveLength(0);
    expect(summary.activity).toHaveLength(0);
    expect(summary.cropTotals).toEqual([]);
    expect(summary.totals.totalBales).toBe(0);
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
    expect(summary.cropTotals.map(t => [t.crop, t.totalBushels])).toEqual([['Corn', 4000], ['Soybeans', 6000], ['Hay', 0]]);
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
    expect(csv).toContain('Total Bales');
    expect(csv).toContain('North 40');
    expect(csv).toContain('Corn');
    expect(csv).toContain('"TOTAL","Corn"');
    expect(csv).toContain('"TOTAL","Soybeans"');
    expect(csv).toContain('"TOTAL","Hay"');
    // landlord share total (1000) should be present
    expect(csv).toContain('1000');
    expect(csv).toContain('125');
  });

  test('per-crop totals rows carry that crop\'s bu/acre, never a cross-crop figure', () => {
    const summary = generateLandlordSummary({ ...baseParams, landlordName: 'John Smith' });
    const csv = generateLandlordSummaryCSV(summary);
    expect(csv).toContain('"TOTAL","Corn","40","4000","100","","1000"');
    expect(csv).toContain('"TOTAL","Soybeans","60","6000","100","","0"');
    expect(csv).toContain('"TOTAL","Hay","40","","","125",""');
    expect(csv).not.toContain('10000');
  });
});


describe('Farm Owner Summary', () => {
  test('includes owned land and all landlords with the same totals and activity sections', () => {
    const summary = generateLandlordSummary({ ...baseParams, scope: 'farm', farmId: 'farm1', landlordName: 'Farm Owner' });
    expect([...new Set(summary.fields.map(field => field.fieldId))]).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(summary.totals).toEqual({ acres: 250, totalBales: 325 });
    // Per-crop totals replace the old cross-crop 19,000 bu / 3,970 bu share figures.
    expect(summary.cropTotals.map(t => [t.crop, t.totalBushels, t.landlordShareBushels, t.totalBales])).toEqual([
      ['Corn', 13000, 3970, 0],
      ['Soybeans', 6000, 0, 0],
      ['Hay', 0, 0, 325],
    ]);
    expect(new Set(summary.activity.map(row => row.activityType))).toEqual(new Set(['plant', 'spray', 'customSpray', 'fertilizer', 'tillage', 'harvest', 'hay']));
    expect(generateLandlordSummaryCSV(summary)).toContain('No-Landlord Field');
  });

  test('excludes other farms, deleted fields/records, other seasons and orphan activity', () => {
    const summary = generateLandlordSummary({
      ...baseParams, scope: 'farm', farmId: 'farm1', landlordName: 'Farm Owner',
      fields: [...fields, { ...fields[0], id: 'foreign', farm_id: 'farm2' }],
      harvestRecords: [
        ...harvestRecords,
        { ...harvestRecords[0], id: 'deleted', deleted_at: '2026-10-01' },
        { ...harvestRecords[0], id: 'old', seasonYear: 2025 },
        { ...harvestRecords[0], id: 'foreign', farm_id: 'farm2' },
        { ...harvestRecords[0], id: 'orphan', fieldId: 'missing' },
        { ...harvestRecords[0], id: 'deleted-field', fieldId: 'f5' },
      ],
    });
    expect(new Set(summary.fields.map(row => row.fieldId)).size).toBe(4);
    // 19,000 bu in all, reported per crop and never as one cross-crop figure.
    expect(summary.cropTotals.filter(t => t.totalBushels > 0).map(t => [t.crop, t.totalBushels])).toEqual([['Corn', 13000], ['Soybeans', 6000]]);
    expect(summary.activity.filter(row => row.activityType === 'harvest')).toHaveLength(3);
  });

  test('fails closed without a current farm', () => {
    expect(generateLandlordSummary({ ...baseParams, scope: 'farm', landlordName: 'Farm Owner' }).fields).toEqual([]);
  });
});
