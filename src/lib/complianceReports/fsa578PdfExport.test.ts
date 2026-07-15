import { describe, expect, it } from 'vitest';

import type { Fsa578ReportRow } from './fsaReports';
import { buildFsa578Reconciliation } from './fsa578PdfExport';

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
    seedVariety: 'P1197',
    intendedUse: 'Grain',
    irrigationCode: 'NI',
    producerShare: '100%',
    landUse: 'Cropland',
    ...overrides,
  };
}

describe('buildFsa578Reconciliation', () => {
  it('counts a double-cropped CLU once in boundary and total cropland acreage', () => {
    const result = buildFsa578Reconciliation([
      row({ id: 'corn', crop: 'Corn', cropSequence: 'First Crop' }),
      row({ id: 'soybeans', crop: 'Soybeans', cropSequence: 'Second Crop' }),
    ]);

    expect(result.cropTotals).toEqual([
      { label: 'Corn / Grain', acres: 80 },
      { label: 'Soybeans / Grain', acres: 80 },
    ]);
    expect(result.tractTotals).toEqual([
      { label: 'Farm 100 / Tract 200', acres: 80 },
    ]);
    expect(result.totalReportedAcres).toBe(80);
  });

  it('keeps distinct CLUs on the same tract in reconciliation totals', () => {
    const result = buildFsa578Reconciliation([
      row({ id: 'clu-1', fieldNumber: '1', acreage: 80 }),
      row({ id: 'clu-2', fieldNumber: '2', fieldName: 'South 40', acreage: 40 }),
      row({ id: 'reference', fieldNumber: '3', acreage: 10, landUse: 'Non-cropland' }),
    ]);

    expect(result.tractTotals).toEqual([
      { label: 'Farm 100 / Tract 200', acres: 120 },
    ]);
    expect(result.totalReportedAcres).toBe(120);
  });
});
