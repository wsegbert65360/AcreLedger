import { describe, expect, test } from 'vitest';

import type { LandlordActivityRow, LandlordSummary } from './generateLandlordSummary';
import { buildOwnerSummaryLayout, formatOwnerDateRange } from './ownerSummaryLayout';

let key = 0;
function row(partial: Omit<LandlordActivityRow, 'sortKey'>): LandlordActivityRow {
  const [mm, dd, yyyy] = partial.date.split('/').map(Number);
  key += 1;
  return { ...partial, sortKey: new Date(yyyy, mm - 1, dd).getTime() + key };
}

const activity: LandlordActivityRow[] = [
  row({ fieldId: 'f1', fieldName: 'North', date: '04/20/2026', activityType: 'plant', crop: 'Corn', detail: 'Seed: P1197' }),
  row({ fieldId: 'f2', fieldName: 'South', date: '06/01/2026', activityType: 'plant', crop: 'Soybeans', detail: 'Seed: AG23' }),
  // Same recipe on two fields two days apart: one line.
  row({ fieldId: 'f1', fieldName: 'North', date: '05/13/2026', activityType: 'spray', crop: 'Corn', detail: 'Durus 3.5qt/ac' }),
  row({ fieldId: 'f3', fieldName: 'East', date: '05/15/2026', activityType: 'spray', crop: 'Corn', detail: 'durus 3.5qt/ac' }),
  // Same recipe a month later: a new line.
  row({ fieldId: 'f1', fieldName: 'North', date: '06/20/2026', activityType: 'spray', crop: 'Corn', detail: 'Durus 3.5qt/ac' }),
  row({ fieldId: 'f4', fieldName: 'Pasture', date: '07/08/2026', activityType: 'hay', crop: 'Hay', detail: '100 round bales · Cutting 1', quantity: 100 }),
  row({ fieldId: 'f4', fieldName: 'Pasture', date: '08/20/2026', activityType: 'hay', crop: 'Hay', detail: '50 round bales · Cutting 2', quantity: 50 }),
  row({ fieldId: 'f1', fieldName: 'North', date: '09/16/2026', activityType: 'harvest', crop: 'Corn', detail: '400 bu', quantity: 400 }),
  row({ fieldId: 'f1', fieldName: 'North', date: '09/16/2026', activityType: 'harvest', crop: 'Corn', detail: '410 bu', quantity: 410 }),
  row({ fieldId: 'f1', fieldName: 'North', date: '09/17/2026', activityType: 'harvest', crop: 'Corn', detail: '190 bu', quantity: 190 }),
  row({ fieldId: 'f2', fieldName: 'South', date: '10/10/2026', activityType: 'harvest', crop: 'Soybean', detail: '600 bu', quantity: 600 }),
];

const summary: LandlordSummary = {
  landlordName: 'Farm Owner',
  generatedAt: '',
  seasonYear: 2026,
  fields: [
    { fieldId: 'f1', fieldName: 'North', acres: 10, landlordName: 'John Smith', crop: 'Corn', totalBushels: 1000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 333.3 },
    { fieldId: 'f2', fieldName: 'South', acres: 20, crop: 'Soybean', totalBushels: 600, buPerAcre: 30, totalBales: 0, landlordShareBushels: 0 },
    { fieldId: 'f4', fieldName: 'Pasture', acres: 15, crop: 'Hay', totalBushels: 0, buPerAcre: null, totalBales: 150, landlordShareBushels: 0 },
    { fieldId: 'f5', fieldName: 'Timber', acres: 8, crop: null, totalBushels: 0, buPerAcre: null, totalBales: 0, landlordShareBushels: 0 },
  ],
  activity,
  cropTotals: [
    { crop: 'Corn', acres: 10, totalBushels: 1000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 333.3 },
    { crop: 'Soybean', acres: 20, totalBushels: 600, buPerAcre: 30, totalBales: 0, landlordShareBushels: 0 },
    { crop: 'Hay', acres: 15, totalBushels: 0, buPerAcre: null, totalBales: 150, landlordShareBushels: 0 },
  ],
  missingShareHarvests: 0,
  totals: { acres: 53, totalBales: 150 },
};

describe('buildOwnerSummaryLayout', () => {
  const layout = buildOwnerSummaryLayout(summary);

  test('keeps one grain section per crop and never adds crops together', () => {
    expect(layout.grainSections.map(s => [s.crop, s.total.totalBushels])).toEqual([['Corn', 1000], ['Soybean', 600]]);
  });

  test('adds share %, owner bushels, season dates and variety to each grain row', () => {
    const north = layout.grainSections[0].rows[0];
    expect(north).toMatchObject({
      fieldName: 'North',
      sharePercent: 33.3,
      owned: false,
      ownerBushels: 666.7,
      plantedDate: '04/20/2026',
      variety: 'P1197',
      harvestStart: '09/16/2026',
      harvestEnd: '09/17/2026',
    });
    expect(layout.grainSections[0].total).toMatchObject({ sharePercent: 33.3, ownerBushels: 666.7 });
  });

  test('marks land with no landlord as owned and links "Soybeans" plantings to a "Soybean" harvest', () => {
    const south = layout.grainSections[1].rows[0];
    expect(south).toMatchObject({ owned: true, sharePercent: 0, ownerBushels: 600, plantedDate: '06/01/2026', variety: 'AG23' });
  });

  test('uses the only planting on a one-crop field even when its crop name is misspelled', () => {
    const typo = buildOwnerSummaryLayout({
      ...summary,
      activity: [
        row({ fieldId: 'f2', fieldName: 'South', date: '06/05/2026', activityType: 'plant', crop: 'Soybeams', detail: 'Seed: KY1936E' }),
        ...activity.filter(a => a.activityType !== 'plant'),
      ],
    });
    expect(typo.grainSections[1].rows[0]).toMatchObject({ plantedDate: '06/05/2026', variety: 'KY1936E' });
  });

  test('builds the hay table with cuttings and last cut date', () => {
    expect(layout.hayRows).toEqual([
      { fieldId: 'f4', fieldName: 'Pasture', acres: 15, cuttings: 2, lastCutDate: '08/20/2026', totalBales: 150, balesPerAcre: 10 },
    ]);
    expect(layout.hayTotal).toEqual({ acres: 15, cuttings: 2, totalBales: 150, balesPerAcre: 10 });
  });

  test('lists fields with no grain or hay as not harvested', () => {
    expect(layout.idleRows).toEqual([{ fieldId: 'f5', fieldName: 'Timber', acres: 8 }]);
    expect(layout.idleAcres).toBe(8);
  });

  test('groups identical work within three days and keeps later repeats on their own line', () => {
    const spray = layout.timeline.find(s => s.activityType === 'spray');
    expect(spray?.groups.map(g => [g.startDate, g.endDate, g.fieldNames, g.recordCount])).toEqual([
      ['05/13/2026', '05/15/2026', ['North', 'East'], 2],
      ['06/20/2026', '06/20/2026', ['North'], 1],
    ]);
    // Harvest and hay are not timeline sections: they are rolled up / in the hay table.
    expect(layout.timeline.map(s => s.activityType)).toEqual(['plant', 'spray']);
  });

  test('rolls harvest loads up to one line per field and crop', () => {
    expect(layout.harvestRollups).toEqual([
      { fieldId: 'f1', fieldName: 'North', crop: 'Corn', startDate: '09/16/2026', endDate: '09/17/2026', days: 2, loads: 3, bushels: 1000 },
      { fieldId: 'f2', fieldName: 'South', crop: 'Soybean', startDate: '10/10/2026', endDate: '10/10/2026', days: 1, loads: 1, bushels: 600 },
    ]);
    expect(layout.latestHarvestDate).toBe('10/10/2026');
  });

  test('handles a farm with no activity', () => {
    const empty = buildOwnerSummaryLayout({ ...summary, fields: [], activity: [], cropTotals: [], totals: { acres: 0, totalBales: 0 } });
    expect(empty).toMatchObject({ grainSections: [], hayRows: [], hayTotal: null, idleRows: [], timeline: [], harvestRollups: [], latestHarvestDate: null });
  });
});

describe('formatOwnerDateRange', () => {
  test('prints one date, a range, or a dash', () => {
    expect(formatOwnerDateRange('09/16/2026', '09/16/2026')).toBe('09/16/2026');
    expect(formatOwnerDateRange('09/16/2026', '09/17/2026')).toBe('09/16/2026 – 09/17/2026');
    expect(formatOwnerDateRange(null, null)).toBe('—');
  });
});
