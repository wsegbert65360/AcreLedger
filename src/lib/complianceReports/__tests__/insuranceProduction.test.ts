import { describe, expect, it } from 'vitest';
import type { Field, HarvestRecord, PlantRecord } from '@/types/farm';
import type { CountyShare } from '@/lib/county/types';
import { buildInsuranceProductionReport } from '../insuranceProduction';
import { buildInsuranceProductionCsv } from '../insuranceProductionExport';
import type { ReportCountyContext } from '../fsaReports';

function field(id: string, overrides: Partial<Field> = {}): Field {
  return {
    id, farm_id: 'farm', name: id, acreage: 80, lat: 38, lng: -93,
    fsaFarmNumber: '1234', fsaTractNumber: '55', deleted_at: null,
    ...overrides,
  } as Field;
}

function plant(id: string, fieldId: string, overrides: Partial<PlantRecord> = {}): PlantRecord {
  return {
    id, fieldId, fieldName: fieldId, seedVariety: 'P1197', acreage: 80, timestamp: 0, crop: 'Corn',
    plantDate: '2026-04-20', cropStatus: 'Planted', irrigationPractice: 'Non-Irrigated',
    seasonYear: 2026, farm_id: 'farm', deleted_at: null,
    ...overrides,
  } as PlantRecord;
}

function load(id: string, fieldId: string, bushels: number, overrides: Partial<HarvestRecord> = {}): HarvestRecord {
  return {
    id, fieldId, fieldName: fieldId, destination: 'town', moisturePercent: 15, landlordSplitPercent: 33,
    bushels, timestamp: 0, seasonYear: 2026, crop: 'Corn', harvestDate: '2026-10-01', scaleTicketNumber: `T-${id}`,
    farm_id: 'farm', deleted_at: null,
    ...overrides,
  } as HarvestRecord;
}

const henry: CountyShare = { countyFips: '29083', countyName: 'Henry', stateAbbr: 'MO', fraction: 1 };
const benton: CountyShare = { countyFips: '29015', countyName: 'Benton', stateAbbr: 'MO', fraction: 1 };

function counties(map: Record<string, CountyShare[]>): ReportCountyContext {
  return {
    sharesForField: id => ({
      basis: 'field-geometry',
      shares: map[id] ?? [{ countyFips: null, countyName: null, stateAbbr: null, fraction: 1 }],
      estimated: (map[id]?.length ?? 1) > 1,
      needsReview: false,
    }),
  };
}

describe('buildInsuranceProductionReport', () => {
  it('makes one enterprise unit per crop and county with 100% production and yield', () => {
    const report = buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'north'), plant('p2', 'south', { acreage: 40 }), plant('p3', 'east', { crop: 'Soybeans', acreage: 50 })],
      harvestRecords: [
        load('l1', 'north', 8000), load('l2', 'north', 8000, { destination: 'bin', binId: 'b1' }),
        load('l3', 'south', 7200, { fsaFarmNumber: '' }),
        load('l4', 'east', 2750, { crop: 'Soybeans' }),
      ],
      fields: [field('north'), field('south', { fsaFarmNumber: '2210', fsaTractNumber: '9' }), field('east')],
      counties: counties({ north: [henry], south: [henry], east: [henry] }),
      binNames: new Map([['b1', 'Bin 1']]),
      cropYear: 2026,
    });

    expect(report.units.map(u => `${u.crop}|${u.county}`)).toEqual(['Corn|Henry, MO', 'Soybeans|Henry, MO']);
    const corn = report.units[0];
    expect(corn).toMatchObject({ plantedAcres: 120, harvestedAcres: 120, production: 23200, soldBushels: 15200, storedBushels: 8000, yield: 193.3 });
    expect(corn.farms).toEqual([
      { farmNumber: '1234', tracts: ['55'], plantedAcres: 80, production: 16000, yield: 200 },
      { farmNumber: '2210', tracts: ['9'], plantedAcres: 40, production: 7200, yield: 180 },
    ]);
    expect(corn.loads.find(l => l.id === 'l2')).toMatchObject({ disposition: 'Stored', reference: 'Bin 1' });
    expect(report.units[1]).toMatchObject({ production: 2750, yield: 55 });
    expect(report.issues).toEqual([]);
  });

  it('splits a two-county field by mapped share and marks it estimated', () => {
    const report = buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'split', { acreage: 100 })],
      harvestRecords: [load('l1', 'split', 18000)],
      fields: [field('split')],
      counties: counties({ split: [{ ...henry, fraction: 0.75 }, { ...benton, fraction: 0.25 }] }),
      cropYear: 2026,
    });
    const byCounty = Object.fromEntries(report.units.map(u => [u.county, u]));
    expect(byCounty['Henry, MO']).toMatchObject({ plantedAcres: 75, production: 13500, estimated: true });
    expect(byCounty['Benton, MO']).toMatchObject({ plantedAcres: 25, production: 4500, estimated: true });
  });

  it('shows irrigated and non-irrigated subtotals inside one unit', () => {
    const report = buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'a', { irrigationPractice: 'Irrigated', acreage: 60 }), plant('p2', 'b', { acreage: 40 })],
      harvestRecords: [load('l1', 'a', 14400), load('l2', 'b', 6000)],
      fields: [field('a'), field('b')],
      counties: counties({ a: [henry], b: [henry] }),
      cropYear: 2026,
    });
    expect(report.units).toHaveLength(1);
    expect(report.units[0].practices).toEqual([
      { practice: 'Irrigated', plantedAcres: 60, harvestedAcres: 60, production: 14400, yield: 240 },
      { practice: 'Non-Irrigated', plantedAcres: 40, harvestedAcres: 40, production: 6000, yield: 150 },
    ]);
  });

  it('counts a failed stand replanted to the same crop once', () => {
    const build = (replant: Partial<PlantRecord>) => buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'a', { cropStatus: 'Failed' }), plant('p2', 'a', replant)],
      harvestRecords: [load('l1', 'a', 16000)],
      fields: [field('a')],
      counties: counties({ a: [henry] }),
      cropYear: 2026,
    }).units[0];
    // Tagged replant, and an untagged one capped at the field's 80 acres.
    expect(build({ plantingPattern: 'Replant' })).toMatchObject({ plantedAcres: 80, yield: 200 });
    expect(build({})).toMatchObject({ plantedAcres: 80, yield: 200 });
    // A partial replant still counts the failed acres that were not replanted.
    expect(build({ plantingPattern: 'Replant', acreage: 30 }).plantedAcres).toBe(80);
  });

  it('keeps a failed half and a planted half of a field as separate acres', () => {
    const unit = buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'a', { cropStatus: 'Failed', acreage: 40 }), plant('p2', 'a', { acreage: 40 })],
      harvestRecords: [load('l1', 'a', 8000)],
      fields: [field('a')],
      counties: counties({ a: [henry] }),
      cropYear: 2026,
    }).units[0];
    expect(unit.plantedAcres).toBe(80);
  });

  it('flags unharvested, failed, unplanted, unknown-county and mixed-bin cases', () => {
    const report = buildInsuranceProductionReport({
      plantRecords: [
        plant('p1', 'a'),
        plant('p2', 'b', { cropStatus: 'Failed' }),
        plant('p3', 'c', { cropStatus: 'Prevented Planting', acreage: 30 }),
        plant('p4', 'f', { crop: 'Soybeans' }),
      ],
      harvestRecords: [
        load('l1', 'b', 2000, { destination: 'bin', binId: 'b1' }),
        load('l2', 'd', 5000, { destination: 'bin', binId: 'b1' }),
        load('l3', 'e', 100, { crop: '' }),
        load('l4', 'f', 1000, { crop: 'Soybeans' }),
      ],
      fields: [field('a'), field('b'), field('c'), field('d'), field('e'), field('f')],
      counties: counties({ a: [henry], b: [henry], c: [henry], d: [benton] }),
      cropYear: 2026,
    });
    const kinds = report.issues.map(i => i.kind).sort();
    expect(kinds).toEqual(['bin-mixed-units', 'county-unknown', 'failed-appraisal', 'harvest-no-crop', 'harvest-no-planting', 'not-harvested']);
    const henryCorn = report.units.find(u => u.county === 'Henry, MO')!;
    expect(henryCorn).toMatchObject({ plantedAcres: 160, harvestedAcres: 80, preventedAcres: 30, production: 2000 });
  });

  it('uses the field\'s only planted crop when a load has no crop', () => {
    const report = buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'a', { crop: 'Soybeans' })],
      harvestRecords: [load('l1', 'a', 4000, { crop: undefined })],
      fields: [field('a')],
      counties: counties({ a: [henry] }),
      cropYear: 2026,
    });
    expect(report.units[0]).toMatchObject({ crop: 'Soybeans', production: 4000, yield: 50 });
  });
});

describe('buildInsuranceProductionCsv', () => {
  it('writes units, farm breakdown, loads and items to check', () => {
    const report = buildInsuranceProductionReport({
      plantRecords: [plant('p1', 'a')],
      harvestRecords: [load('l1', 'a', 16000)],
      fields: [field('a')],
      counties: counties({ a: [henry] }),
      cropYear: 2026,
    });
    const csv = buildInsuranceProductionCsv({ metadata: { farmName: 'QA Farm', cropYear: 2026, reportDate: '2026-11-19' }, report });
    expect(csv).toContain('Crop Insurance Production Worksheet');
    expect(csv).toContain('"Henry, MO","Corn","Non-Irrigated","P1197","80","80","0","16000","16000","0","200","15","No"');
    expect(csv).toContain('"BY FSA FARM NUMBER"');
    expect(csv).toContain('"Henry, MO","Corn","1234","55","80","16000","200"');
    expect(csv).toContain('"2026-10-01","Henry, MO","Corn","a","1234","55","Non-Irrigated","Sold","T-l1","15","16000","16000","No"');
  });
});
