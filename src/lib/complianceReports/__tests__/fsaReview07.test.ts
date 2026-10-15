import { describe, expect, it } from 'vitest';

import { getLandlordSplitPercent } from '@/lib/cropShare';
import { buildFsa578Readiness, buildLandlordReadiness, buildSprayReadiness } from '@/lib/reportReadiness';
import { areaForProductTotal } from '@/lib/sprayExportFormatters';
import type { Field, HarvestRecord, PlantRecord, SprayRecord } from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';
import { sanitizeCsvValue } from '@/utils/csv';
import { calculateSprayProductFields } from '@/utils/unitConversion';

import { buildFsa578Reconciliation } from '../fsa578PdfExport';
import { buildFsa578Rows, buildFsaFallProductionRows, calculateFsa578PlantedAcreTotals, generateMissouriLogRows, validateFsa578Rows } from '../fsaReports';
import { generateLandlordSummary } from '../generateLandlordSummary';

const field: Field = { id: 'f', farm_id: 'farm', name: 'North', acreage: 40, lat: 0, lng: 0,
  fsaFarmNumber: '1', fsaTractNumber: '2/3', cluNumbers: ['1', '2'], deleted_at: null };
const assignment: FieldCluAssignment = { id: 'a', farmId: 'farm', fieldId: 'f', tractKey: '1-2',
  cluNumber: '1', acres: 40, landUse: 'cropland', assignedAt: '', deletedAt: null };
const plant = (id: string, acreage: number, extras: Partial<PlantRecord> = {}): PlantRecord => ({
  id, fieldId: 'f', fieldName: 'North', farm_id: 'farm', crop: 'Corn', seedVariety: id,
  acreage, plantDate: '2026-05-01', timestamp: 0, seasonYear: 2026, deleted_at: null, ...extras,
});
const tract = (tractKey: string, cluNumber: string, acres: number): FsaTractImport => ({
  id: tractKey, farmId: 'farm', tractKey, filename: '', importedAt: '', featureCount: 1, deletedAt: null,
  geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { cluNumber, acres },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] },
});

describe('review-07 acreage and compliance regressions', () => {
  it('reports 25 and 15 acre varieties on a 40 acre CLU with matching crop and boundary totals', () => {
    const rows = buildFsa578Rows([plant('a', 25), plant('b', 15)], [field], [assignment]);
    expect(rows.map(r => r.acreage)).toEqual([25, 15]);
    expect(calculateFsa578PlantedAcreTotals(rows).totalAcres).toBe(40);
    expect(buildFsa578Reconciliation(rows)).toMatchObject({ totalReportedAcres: 40, cropTotals: [{ acres: 40 }] });
    expect(validateFsa578Rows(rows).filter(i => i.field === 'acreage')).toEqual([]);
  });

  it('apportions a partial planting across multiple CLUs and caps individual plantings', () => {
    const assignments = [{ ...assignment, acres: 30 }, { ...assignment, id: 'b', cluNumber: '2', acres: 10 }];
    expect(buildFsa578Rows([plant('a', 20)], [field], assignments).map(r => r.acreage)).toEqual([15, 5]);
    expect(buildFsa578Rows([plant('a', 100)], [field], assignments).map(r => r.acreage)).toEqual([30, 10]);
  });

  it('flags an over-CLU same-sequence sum while allowing a second crop and failed/replant', () => {
    const rows = buildFsa578Rows([plant('a', 25), plant('b', 20)], [field], [assignment]);
    expect(validateFsa578Rows(rows).some(i => i.severity === 'error' && i.message.includes('same-sequence'))).toBe(true);
    const doubleCrop = buildFsa578Rows([plant('a', 40), plant('b', 40, { cropSequence: 'Second Crop' })], [field], [assignment]);
    expect(doubleCrop.map(r => r.acreage)).toEqual([40, 40]);
    expect(validateFsa578Rows(doubleCrop).some(i => i.message.includes('same-sequence'))).toBe(false);
    const replant = buildFsa578Rows([plant('a', 40, { cropStatus: 'Failed' }), plant('b', 40)], [field], [assignment]);
    expect(replant.map(r => r.acreage)).toEqual([40, 40]);
    expect(validateFsa578Rows(replant).some(i => i.message.includes('same-sequence'))).toBe(false);
  });

  it('matches only real legacy tract/CLU pairs and emits one unmatched row per CLU', () => {
    const rows = buildFsa578Rows([plant('a', 40)], [field], [], [tract('1-2', '1', 40), tract('1-3', '9', 10)]);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.fieldNumber === '1')).toMatchObject({ tractNumber: '2', acreage: 40 });
    expect(rows.find(r => r.fieldNumber === '2')).toMatchObject({ tractNumber: '', acreage: 0 });
    expect(rows.some(r => r.tractNumber === '3')).toBe(false);
  });

  it('preserves fractional producer shares', () => {
    const rows = buildFsa578Rows([plant('a', 25, { producerShare: 33.33 }), plant('b', 15, { producerShare: 66.67 })], [field], [assignment]);
    expect(rows.map(r => r.producerShare)).toEqual(['33.33%', '66.67%']);
  });

  it('warns on stale and removed CLU assignments in readiness', () => {
    const rows = buildFsa578Rows([plant('a', 40)], [field], [assignment,
      { ...assignment, id: 'b', cluNumber: '2', acres: 10 }], [tract('1-2', '1', 30)]);
    const summary = buildFsa578Readiness(rows, validateFsa578Rows(rows));
    expect(summary.issues.some(i => i.message.includes('differ from tract acres'))).toBe(true);
    expect(summary.issues.some(i => i.message.includes('missing from tract'))).toBe(true);
  });

  it('converts square feet for US product calculation and Missouri acres', () => {
    const product = { product: 'Test', rate: '32', rateUnit: 'fl oz/ac', epaRegNumber: '123' };
    const area = areaForProductTotal(43560, 'sqft', product.rateUnit, 'us-epa')!;
    expect(area).toBe(1);
    expect(calculateSprayProductFields(product, area)).toMatchObject({ totalProductAmount: '1', totalProductUnit: 'qt' });
    const record: SprayRecord = { id: 's', farm_id: 'farm', fieldId: 'f', fieldName: 'North', products: [product],
      treatedAreaSize: 43560, treatedAreaUnit: 'sqft', windSpeed: 0, temperature: 0,
      timestamp: 0, seasonYear: 2026, deleted_at: null };
    const cells = generateMissouriLogRows([record], [field])[0].split(',');
    expect(cells[9]).toBe('"1"');
    expect(cells[11]).toBe('"1 qt"');
  });

  it('flags missing US end time and equipment even with nonCompliant false', () => {
    const summary = buildSprayReadiness([{ id: 's', fieldId: 'f', fieldName: 'North',
      products: [{ product: 'Test', rate: '1', rateUnit: 'oz/ac', epaRegNumber: '123' }],
      windSpeed: 0, nonCompliant: false, startTime: '08:00', windDirection: 'N',
      applicatorName: 'Operator', licenseNumber: '123', cropOrSiteTreated: 'Corn', applicationMethod: 'Ground',
      treatedAreaSize: 40 }], 10);
    expect(summary.status).toBe('review');
    expect(summary.issues.map(i => i.message)).toEqual(expect.arrayContaining([
      'North is missing End time.', 'North is missing Equipment ID.',
    ]));
  });

  it('keeps numeric negatives and neutralizes whitespace-prefixed formulas', () => {
    expect(sanitizeCsvValue(-3)).toBe('"-3"');
    expect(sanitizeCsvValue('  =1+1')).toBe('"\'  =1+1"');
    expect(sanitizeCsvValue('\ttext')).toBe('"\'\ttext"');
  });
});


describe('review-07 owner decisions', () => {
  it('preserves partial failed acres without expanding unrelated plantings', () => {
    const records = [plant('failed', 8, { cropStatus: 'Failed', cropSequence: 'Second Crop', plantingPattern: 'Replant' }),
      plant('main', 24), plant('variety', 16)];
    const rows = buildFsa578Rows(records, [field], [assignment]);
    expect(rows.map(row => row.acreage)).toEqual([8, 24, 16]);
    expect(validateFsa578Rows(rows).filter(issue => issue.field === 'acreage')).toEqual([]);
    const split = buildFsa578Rows(records, [field], [
      { ...assignment, acres: 30 }, { ...assignment, id: 'b', cluNumber: '2', acres: 10 },
    ]);
    expect(split.filter(row => row.cropStatus === 'Failed').map(row => row.acreage)).toEqual([6, 2]);
    const legacy = buildFsa578Rows(records, [{ ...field, fsaTractNumber: '2', cluNumbers: ['1'] }], [], [tract('1-2', '1', 40)]);
    expect(legacy.map(row => row.acreage)).toEqual([8, 24, 16]);
  });

  it.each(['Cover Crop', 'Volunteer'] as const)('keeps %s separate from main-crop acres and the CLU cap', cropStatus => {
    const rows = buildFsa578Rows([plant('main', 40), plant('supplemental', 12, { cropStatus, seedVariety: 'main' })], [field], [assignment]);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.cropStatus === cropStatus)?.acreage).toBe(12);
    expect(validateFsa578Rows(rows).filter(issue => issue.field === 'acreage')).toEqual([]);
    expect(calculateFsa578PlantedAcreTotals(rows)).toEqual({ totalAcres: 40, byField: [{ fieldName: 'North', acres: 40 }] });
    expect(buildFsa578Reconciliation(rows).cropTotals.some(row => row.label.includes(cropStatus) && row.acres === 12)).toBe(true);
    expect(buildFsa578Reconciliation(rows).totalReportedAcres).toBe(40);
    expect(calculateFsa578PlantedAcreTotals(rows.filter(row => row.cropStatus === cropStatus)).totalAcres).toBe(0);
    const over = buildFsa578Rows([plant('main', 30), plant('extra', 20), plant('supplemental', 12, { cropStatus })], [field], [assignment]);
    expect(validateFsa578Rows(over).some(issue => issue.message.includes('same-sequence'))).toBe(true);
  });

  it.each([0, 100, 66.67])('uses producer share %s instead of conflicting stored harvest splits', producerShare => {
    const ownerField = { ...field, producerShare, landlordName: 'Owner' };
    const harvest: HarvestRecord = { id: 'h', fieldId: 'f', fieldName: 'North', destination: 'town',
      moisturePercent: 15, landlordSplitPercent: 90, bushels: 1000, crop: 'Corn', harvestDate: '2026-10-01',
      farm_id: 'farm', timestamp: 0, seasonYear: 2026, deleted_at: null };
    const summary = generateLandlordSummary({ landlordName: 'Owner', fields: [ownerField], cluAssignments: [assignment],
      harvestRecords: [harvest], plantRecords: [], sprayRecords: [], customSprayRecords: [],
      fertilizerApplications: [], tillageRecords: [], hayHarvestRecords: [] });
    expect(getLandlordSplitPercent(ownerField, 90)).toBeCloseTo(100 - producerShare);
    expect(summary.totals.landlordShareBushels).toBeCloseTo(1000 * (100 - producerShare) / 100);
    expect(buildLandlordReadiness(summary, [{ ...harvest, landlordSplitPercent: undefined }]).issues.filter(issue => issue.category === 'Crop share')).toEqual([]);
    expect(buildFsaFallProductionRows({ harvestRecords: [harvest], hayRecords: [], fields: [ownerField] }).grainRows[0].landlordSplitPercent).toBeCloseTo(100 - producerShare);
    const legacy = generateLandlordSummary({ landlordName: 'Owner', fields: [{ ...ownerField, producerShare: undefined }],
      cluAssignments: [], harvestRecords: [harvest], plantRecords: [], sprayRecords: [], customSprayRecords: [],
      fertilizerApplications: [], tillageRecords: [], hayHarvestRecords: [] });
    expect(legacy.totals.landlordShareBushels).toBe(900);
    expect(buildLandlordReadiness(legacy, [{ ...harvest, landlordSplitPercent: undefined }]).issues.some(issue => issue.category === 'Crop share')).toBe(true);
    expect(buildLandlordReadiness({ ...summary, fields: summary.fields.map(row => ({ ...row, producerShare: 101 })) }, [harvest]).issues.some(issue => issue.category === 'Crop share')).toBe(true);
  });
});
