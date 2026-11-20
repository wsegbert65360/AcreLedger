import { describe, expect, it } from 'vitest';
import type { Fsa578ReportRow } from '../fsaReports';
import {
  FSA578_OTHER_CROP_COLUMN,
  buildFsa578FormSheets,
  fsa578CountyLabel,
  derivedFsaStatusCode,
  fsaIntendedUseCode,
  fsaPracticeCode,
  fsaStatusCode,
} from '../fsa578FormLayout';

function row(overrides: Partial<Fsa578ReportRow>): Fsa578ReportRow {
  return {
    id: 'row-1',
    fieldId: 'field-1',
    date: '2026-04-15',
    fieldName: 'North 80',
    farmNumber: '100',
    tractNumber: '200',
    fieldNumber: '1',
    acreage: 80,
    crop: 'Corn',
    seedVariety: '',
    intendedUse: 'Grain',
    irrigationCode: 'NI',
    producerShare: '100%',
    landUse: 'Cropland',
    ...overrides,
  };
}

describe('FSA-578 form codes', () => {
  it('maps practice', () => {
    expect(fsaPracticeCode({ irrigationCode: 'IR' })).toBe('I');
    expect(fsaPracticeCode({ irrigationCode: 'NI' })).toBe('N');
  });

  it('maps crop status and sequence', () => {
    const base = { date: '', crop: 'Corn', intendedUse: 'Grain' };
    expect(fsaStatusCode({ ...base, cropStatus: 'Planted' })).toBe('I');
    expect(fsaStatusCode({ ...base, cropStatus: 'Planted', cropSequence: 'Second Crop' })).toBe('D');
    expect(fsaStatusCode({ ...base, cropStatus: 'Prevented Planting' })).toBe('P');
    expect(fsaStatusCode({ ...base, cropStatus: 'Prevented Planting', cropSequence: 'Second Crop' })).toBe('DP');
    expect(fsaStatusCode({ ...base, cropStatus: 'Failed' })).toBe('F');
    expect(fsaStatusCode({ ...base, cropStatus: 'Failed', cropSequence: 'Second Crop' })).toBe('DF');
    expect(fsaStatusCode({ ...base, cropStatus: 'Volunteer' })).toBe('V');
    expect(fsaStatusCode({ ...base })).toBe('');
    expect(fsaStatusCode({ date: '', crop: 'Pasture', intendedUse: 'Grazing' })).toBe('I');
  });

  it('uses the manual status code over the derived one', () => {
    const base = { date: '2026-05-01', crop: 'Soybeans', intendedUse: 'Grain', cropStatus: 'Planted' as const, cropSequence: 'Second Crop' as const };
    expect(fsaStatusCode(base)).toBe('D');
    expect(fsaStatusCode({ ...base, fsaStatusOverride: 'S' })).toBe('S');
    expect(derivedFsaStatusCode({ ...base })).toBe('D');
  });

  it('maps intended use', () => {
    expect(fsaIntendedUseCode('Grain')).toBe('GR');
    expect(fsaIntendedUseCode('Corn silage')).toBe('SL');
    expect(fsaIntendedUseCode('Hay')).toBe('FG');
    expect(fsaIntendedUseCode('Pasture')).toBe('GZ');
    expect(fsaIntendedUseCode('Seed')).toBe('SD');
    expect(fsaIntendedUseCode('GZ')).toBe('GZ');
    expect(fsaIntendedUseCode('Something else')).toBe('');
  });
});

describe('buildFsa578FormSheets', () => {
  it('groups by farm in numeric order, unassigned last, and lists other farms', () => {
    const sheets = buildFsa578FormSheets([
      row({ id: 'a', farmNumber: '2050' }),
      row({ id: 'b', farmNumber: '' }),
      row({ id: 'c', farmNumber: '100' }),
    ]);
    expect(sheets.map(s => s.farmNumber)).toEqual(['100', '2050', 'UNASSIGNED']);
    expect(sheets[0].otherFarms).toEqual(['2050']);
    expect(sheets[2].unassigned).toBe(true);
  });

  it('counts farmland and cropland once per CLU, double crops included', () => {
    const [sheet] = buildFsa578FormSheets([
      row({ id: 'corn', cluAcres: 80 }),
      row({ id: 'beans', crop: 'Soybeans', cropSequence: 'Second Crop', cluAcres: 80 }),
      row({ id: 'waterway', fieldNumber: '9', landUse: 'Non-cropland', crop: 'Non-crop', acreage: 5 }),
    ]);
    expect(sheet.croplandAcres).toBe(80);
    expect(sheet.farmlandAcres).toBe(85);
    expect(sheet.cropColumns).toEqual(['CORN', 'SOYBEANS']);
    expect(sheet.totals).toEqual([80, 80]);
  });

  it('gives each landlord one key per farm and a share line without acres', () => {
    const [sheet] = buildFsa578FormSheets([
      row({ id: 'a', producerShare: '50%', landlordName: 'Smith' }),
      row({ id: 'b', fieldNumber: '2', producerShare: '75%', landlordName: 'Smith' }),
      row({ id: 'c', fieldNumber: '3', producerShare: '60%' }),
    ]);
    expect(sheet.producers).toEqual([
      { key: 1, name: '' },
      { key: 2, name: 'Smith' },
      { key: 3, name: 'Other producer (name not recorded)' },
    ]);
    const extra = sheet.lines.filter(line => !line.primary);
    expect(extra.map(line => [line.key, line.share, line.acres])).toEqual([[2, '50.00', null], [2, '25.00', null], [3, '40.00', null]]);
    expect(sheet.totals).toEqual([240]);
  });

  it('lists physical counties per farm, most acres first, and labels split fields', () => {
    const share = (countyName: string | null, fraction: number) => ({ countyFips: countyName ? '29083' : null, countyName, stateAbbr: countyName ? 'MO' : null, fraction });
    const counties = {
      sharesForField: (fieldId: string) => ({
        basis: 'field-geometry' as const,
        estimated: fieldId === 'split',
        needsReview: false,
        shares: fieldId === 'split' ? [share('Benton', 0.4), share('Henry', 0.6)]
          : fieldId === 'unknown' ? [share(null, 1)]
          : [share('Benton', 1)],
      }),
    };
    const [sheet] = buildFsa578FormSheets([
      row({ id: 'a', fieldId: 'split', acreage: 100 }),
      row({ id: 'b', fieldId: 'whole', fieldNumber: '2', acreage: 10 }),
      row({ id: 'c', fieldId: 'unknown', fieldNumber: '3', acreage: 5 }),
    ], counties);
    expect(sheet.counties).toEqual(['Henry, MO', 'Benton, MO']);
    expect(fsa578CountyLabel('split', counties)).toBe('Henry, MO 60% / Benton, MO 40%');
    expect(fsa578CountyLabel('unknown', counties)).toBe('');
    expect(fsa578CountyLabel('whole')).toBe('');
    expect(buildFsa578FormSheets([row({})])[0].counties).toEqual([]);
  });

  it('folds crops past the column limit into OTHER', () => {
    const crops = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const [sheet] = buildFsa578FormSheets(crops.map((crop, i) => row({ id: crop, crop, fieldNumber: String(i + 1), acreage: 1 })));
    expect(sheet.cropColumns).toHaveLength(8);
    expect(sheet.cropColumns[7]).toBe(FSA578_OTHER_CROP_COLUMN);
    expect(sheet.totals[7]).toBe(2);
  });
});
