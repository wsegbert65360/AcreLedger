import { describe, expect, it } from 'vitest';
import type { Field, HarvestRecord, HayHarvestRecord } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { buildCountyReportContext } from '@/lib/county/reportContext';
import type { CountyAssignment } from '@/lib/county/types';
import { row } from '@/lib/county/__tests__/fixtures';
import {
  COUNTY_UNKNOWN_LABEL, buildFsaFallCropTotals, buildFsaFallGroupedTotals, buildFsaFallProductionCsv,
  buildFsaFallProductionRows,
} from '../fsaReports';

const field = (id: string, farm: string, tract: string, over: Partial<Field> = {}): Field => ({
  id, name: id, acreage: 55, lat: null, lng: null, farm_id: 'farm-a', deleted_at: null,
  fsaFarmNumber: farm, fsaTractNumber: tract, ...over,
} as Field);

const harvest = (id: string, fieldId: string, bushels: number, crop = 'Corn'): HarvestRecord => ({
  id, fieldId, fieldName: fieldId, crop, bushels, destination: 'bin', harvestDate: '2026-10-01', timestamp: 1,
  seasonYear: 2026, farm_id: 'farm-a', deleted_at: null,
} as unknown as HarvestRecord);

const hay = (id: string, fieldId: string, baleCount: number): HayHarvestRecord => ({
  id, fieldId, fieldName: fieldId, date: '2026-07-08', baleCount, cuttingNumber: 1, baleType: 'Round',
  timestamp: 1, seasonYear: 2026, farm_id: 'farm-a', deleted_at: null,
} as unknown as HayHarvestRecord);

const geo = (fieldId: string, fips: string, name: string, proportion: number, acres: number): CountyAssignment => row({
  id: `${fieldId}-${fips}`, subjectKey: fieldId, fieldId, countyFips: fips, countyName: name, proportion, mappedAcres: acres,
});

function context(fields: Field[], rows: CountyAssignment[], clus: FieldCluAssignment[] = []) {
  return buildCountyReportContext({ farmId: 'farm-a', fields, cluAssignments: clus, countyAssignments: rows });
}

describe('Fall FSA production with saved county assignments', () => {
  it('puts a single-county field wholly in its county, measured not estimated', () => {
    const fields = [field('f1', '6418', '1')];
    const report = buildFsaFallProductionRows({
      harvestRecords: [harvest('h1', 'f1', 1000)], hayRecords: [], fields,
      counties: context(fields, [geo('f1', '29083', 'Henry', 1, 55)]),
    });
    expect(report.grainRows).toHaveLength(1);
    expect(report.grainRows[0]).toMatchObject({ county: 'Henry, MO', countyFips: '29083', production: 1000, estimated: false, allocationFraction: 1 });
  });

  it('splits a two-county field proportionally, labels it estimated, and reconciles exactly', () => {
    const fields = [field('f1', '6418', '1')];
    const rows = [geo('f1', '29083', 'Henry', 10 / 55, 10), geo('f1', '29015', 'Benton', 45 / 55, 45)]
      .map(r => r.countyFips === '29015' ? { ...r, countyName: 'Benton' } : r);
    const report = buildFsaFallProductionRows({
      harvestRecords: [harvest('h1', 'f1', 1001.37)], hayRecords: [], fields, counties: context(fields, rows),
    });
    expect(report.grainRows).toHaveLength(2);
    expect(report.grainRows.every(r => r.estimated && r.recordProduction === 1001.37)).toBe(true);
    const sum = report.grainRows.reduce((s, r) => s + r.production, 0);
    expect(Math.round(sum * 100) / 100).toBe(1001.37);
    expect(report.grainRows.find(r => r.countyFips === '29015')!.production).toBeGreaterThan(800);
  });

  it('keeps whole bales: split hay adds back to the cutting with no fractions', () => {
    const fields = [field('f1', '6418', '1')];
    const rows = [geo('f1', '29083', 'Henry', 1 / 3, 18), geo('f1', '29015', 'Benton', 2 / 3, 37)];
    const report = buildFsaFallProductionRows({ harvestRecords: [], hayRecords: [hay('c1', 'f1', 10)], fields, counties: context(fields, rows) });
    expect(report.hayRows.map(r => r.production).every(Number.isInteger)).toBe(true);
    expect(report.hayRows.reduce((s, r) => s + r.production, 0)).toBe(10);
  });

  it('uses a field boundary inside a spanning tract: that field is not split by its tract', () => {
    const fields = [field('inside', '6418', '1'), field('across', '6418', '1')];
    const rows = [
      geo('inside', '29083', 'Henry', 1, 20),
      geo('across', '29083', 'Henry', 0.5, 27), geo('across', '29015', 'Benton', 0.5, 28),
    ];
    const report = buildFsaFallProductionRows({
      harvestRecords: [harvest('a', 'inside', 100), harvest('b', 'across', 200)], hayRecords: [], fields, counties: context(fields, rows),
    });
    const inside = report.grainRows.filter(r => r.fieldName === 'inside');
    expect(inside).toHaveLength(1);
    expect(inside[0].estimated).toBe(false);
    expect(report.grainRows.filter(r => r.fieldName === 'across')).toHaveLength(2);
  });

  it('lists unidentified fields under County unknown, and still counts them', () => {
    const fields = [field('f1', '6418', '1'), field('f2', '6418', '2')];
    const ctx = context(fields, [geo('f1', '29083', 'Henry', 1, 55)]);
    const report = buildFsaFallProductionRows({ harvestRecords: [harvest('a', 'f1', 100), harvest('b', 'f2', 40)], hayRecords: [], fields, counties: ctx });
    expect(ctx.fieldsWithoutCounty).toBe(1);
    const totals = buildFsaFallGroupedTotals(report.grainRows);
    expect(totals).toContainEqual(expect.objectContaining({ scope: 'County', county: COUNTY_UNKNOWN_LABEL, production: 40, estimated: false }));
    expect(totals).toContainEqual(expect.objectContaining({ scope: 'Farm', farmNumber: '6418', production: 140 }));
  });

  it('treats a report built with no county context as County unknown, never reading notes', () => {
    const fields = [field('f1', '6418', '1', { notes: 'County: Henry\nState: MO' })];
    const report = buildFsaFallProductionRows({ harvestRecords: [harvest('a', 'f1', 10)], hayRecords: [], fields });
    expect(report.grainRows[0].county).toBe('');
    expect(report.grainRows[0].countyFips).toBeNull();
  });

  it('groups county → FSA farm number → tract with farm totals unchanged, crops and units kept apart', () => {
    const fields = [field('f1', '6418', '1'), field('f2', '6418', '2'), field('f3', '9000', '7')];
    const rows = [
      geo('f1', '29083', 'Henry', 1, 55), geo('f2', '29015', 'Benton', 1, 55),
      geo('f3', '29083', 'Henry', 0.5, 27), geo('f3', '29015', 'Benton', 0.5, 28),
    ];
    const report = buildFsaFallProductionRows({
      harvestRecords: [harvest('a', 'f1', 100), harvest('b', 'f2', 50, 'Soybeans'), harvest('c', 'f3', 80)],
      hayRecords: [hay('d', 'f2', 12)], fields, counties: context(fields, rows),
    });
    const all = [...report.grainRows, ...report.hayRows];
    const totals = buildFsaFallGroupedTotals(all);
    const pick = (scope: string, county: string, farm: string, tract: string, crop: string) =>
      totals.find(t => t.scope === scope && t.county === county && t.farmNumber === farm && t.tractNumber === tract && t.crop === crop);
    expect(pick('Farm', '', '6418', '', 'Corn')?.production).toBe(100);
    expect(pick('Farm', '', '9000', '', 'Corn')?.production).toBe(80);
    expect(pick('County / farm / tract', 'Henry, MO', '6418', '1', 'Corn')?.production).toBe(100);
    expect(pick('County / farm / tract', 'Benton, MO', '6418', '2', 'Soybeans')?.production).toBe(50);
    expect(pick('County / farm / tract', 'Henry, MO', '9000', '7', 'Corn')?.estimated).toBe(true);
    // Crops and units never mix.
    expect(totals.some(t => t.crop === 'Corn' && t.unit === 'bales')).toBe(false);
    // Every level reconciles to the overall total.
    for (const crop of buildFsaFallCropTotals(all)) {
      const levelSum = (scope: string) => Math.round(totals
        .filter(t => t.scope === scope && t.crop === crop.crop && t.unit === crop.unit)
        .reduce((s, t) => s + t.production, 0) * 100) / 100;
      for (const scope of ['Farm', 'County', 'County / farm', 'County / farm / tract']) {
        expect(levelSum(scope)).toBe(crop.production);
      }
    }
  });

  it('identifies estimated and unknown allocations in the CSV', () => {
    const fields = [field('f1', '6418', '1'), field('f2', '6418', '2')];
    const rows = [geo('f1', '29083', 'Henry', 0.5, 27), geo('f1', '29015', 'Benton', 0.5, 28)];
    const report = buildFsaFallProductionRows({ harvestRecords: [harvest('a', 'f1', 100), harvest('b', 'f2', 10)], hayRecords: [], fields, counties: context(fields, rows) });
    const csv = buildFsaFallProductionCsv({ metadata: { farmName: 'Test', cropYear: 2026, reportDate: '2026-11-19' }, rows: report.grainRows });
    expect(csv).toContain('Estimated (proportional to mapped county acres)');
    expect(csv).toContain(COUNTY_UNKNOWN_LABEL);
    expect(csv).toContain('"County / farm / tract"');
    expect(csv).toContain('Estimated rows:');
    // Screen, CSV and PDF read the same rows, so the CSV totals match the on-screen builder.
    for (const t of buildFsaFallGroupedTotals(report.grainRows)) {
      expect(csv).toContain(`"${t.scope}","${t.county}","${t.farmNumber}","${t.tractNumber}"`);
    }
  });

  it('ignores another farm\'s county rows', () => {
    const fields = [field('f1', '6418', '1')];
    const other = { ...geo('f1', '29083', 'Henry', 1, 55), farmId: 'farm-b' };
    const ctx = context(fields, [other]);
    expect(ctx.sharesForField('f1').shares[0].countyFips).toBeNull();
  });

  it('is deterministic: the same saved rows give identical report rows', () => {
    const fields = [field('f1', '6418', '1')];
    const rows = [geo('f1', '29083', 'Henry', 1 / 3, 18), geo('f1', '29015', 'Benton', 2 / 3, 37)];
    const build = () => buildFsaFallProductionRows({ harvestRecords: [harvest('a', 'f1', 99.99)], hayRecords: [], fields, counties: context(fields, [...rows].reverse()) });
    expect(build()).toEqual(build());
  });
});
