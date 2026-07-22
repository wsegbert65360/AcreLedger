import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsPdfMock } from '@/test/jspdfMock';
import type { Fsa578ReportRow, Fsa578ValidationIssue, Fsa578WorksheetMetadata } from '../fsaReports';

const pdf = createJsPdfMock();
vi.doMock('jspdf', () => ({ default: pdf.JsPdf }));
vi.doMock('jspdf-autotable', () => ({ default: pdf.autoTable }));
vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.doMock('@/lib/native', () => ({ native: { sharePdf: pdf.sharePdf } }));

let exportFsa578WorksheetPdf: typeof import('../fsa578PdfExport').exportFsa578WorksheetPdf;
beforeAll(async () => {
  ({ exportFsa578WorksheetPdf } = await import('../fsa578PdfExport'));
});

const metadata: Fsa578WorksheetMetadata = {
  farmName: 'Test Farm',
  cropYear: 2026,
  reportDate: '2026-07-21',
};

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

function generate(rows: Fsa578ReportRow[], issues: Fsa578ValidationIssue[] = []) {
  exportFsa578WorksheetPdf({ metadata, rows, issues, fileName: 'fsa578.pdf' });
}

describe('exportFsa578WorksheetPdf', () => {
  beforeEach(() => pdf.reset());

  it('renders sections in canonical order: entry rows, reconciliation, review, all-CLU reference', () => {
    generate([row({})]);

    const text = pdf.allText();
    const section1 = text.indexOf('SECTION 1 - CROPLAND REPORTING ROWS');
    const section2 = text.indexOf('SECTION 2 - RECONCILIATION TOTALS');
    const section3 = text.indexOf('SECTION 3 - ITEMS TO REVIEW BEFORE FSA ENTRY');
    const section4 = text.indexOf('SECTION 4 - ALL CLU REFERENCE');
    expect(section1).toBeGreaterThanOrEqual(0);
    expect(section2).toBeGreaterThan(section1);
    expect(section3).toBeGreaterThan(section2);
    expect(section4).toBeGreaterThan(section3);

    const tables = pdf.autoTables();
    expect(tables).toHaveLength(5);
    // Section 1: cropland entry table.
    expect(tables[0].head[0]).toEqual(['FARM', 'TRACT', 'CLU', 'FIELD', 'CROP', 'STATUS', 'ACRES', 'PLANT DATE', 'USE', 'IRR', 'SHARE', 'SEQ', 'PRACTICE / NOTES']);
    // Section 2: crop/use totals then farm/tract totals.
    expect(tables[1].head[0]).toEqual(['CROP / INTENDED USE', 'REPORTABLE ACRES']);
    expect(tables[2].head[0]).toEqual(['FARM / TRACT', 'CROPLAND ACRES']);
    // Section 3: review items.
    expect(tables[3].head[0]).toEqual(['PRIORITY', 'FIELD / CLU', 'ITEM TO VERIFY']);
    // Section 4: all-CLU reference.
    expect(tables[4].head[0]).toEqual(['FARM', 'TRACT', 'CLU', 'LAND USE', 'ACRES', 'FIELD', 'CROP / USE', 'REPORTING NOTE']);
  });

  it('keeps non-cropland CLUs out of the entry table and labels them reference-only in the appendix', () => {
    const nonCropland = row({ id: 'row-2', fieldNumber: '9', fieldName: 'Waterway', landUse: 'Non-cropland', crop: '', acreage: 5 });
    generate([row({}), nonCropland]);

    const tables = pdf.autoTables();
    // Section 1 entry table: only the cropland CLU.
    expect(tables[0].body).toHaveLength(1);
    expect(tables[0].body[0][2]).toBe('1');

    // Section 4 appendix: both CLUs, non-cropland explicitly reference-only.
    expect(tables[4].body).toHaveLength(2);
    const appendixNonCropland = tables[4].body.find(r => r[2] === '9');
    expect(appendixNonCropland).toBeDefined();
    expect(appendixNonCropland?.[6]).toBe('Non-crop');
    expect(appendixNonCropland?.[7]).toBe('Reference only - do not report as planted crop');
    const appendixCropland = tables[4].body.find(r => r[2] === '1');
    expect(appendixCropland?.[7]).toBe('Included in Section 1');
  });

  it('renders readiness issues with severity, field/CLU identity, and message', () => {
    const issues: Fsa578ValidationIssue[] = [
      { rowId: 'row-1', severity: 'error', field: 'crop', message: 'Missing crop for planted acreage' },
    ];
    generate([row({})], issues);

    const reviewTable = pdf.autoTables()[3];
    expect(reviewTable.body).toHaveLength(1);
    expect(reviewTable.body[0][0]).toBe('ERROR');
    expect(reviewTable.body[0][1]).toBe('North 80 / CLU 1');
    expect(reviewTable.body[0][2]).toBe('Missing crop for planted acreage');
  });

  it('states that county FSA review is still required on a clean report', () => {
    generate([row({})]);

    const reviewTable = pdf.autoTables()[3];
    expect(reviewTable.body).toHaveLength(1);
    expect(reviewTable.body[0][2]).toBe('No missing required reporting data was detected. FSA office review is still required.');
  });

  it('includes the disclaimer, FSA correction lines, and review signature block', () => {
    generate([row({})]);

    const text = pdf.allText();
    expect(text).toContain('Not an official USDA form.');
    expect(text).toContain('FSA office corrections / notes:');
    expect(text).toContain('Reviewed with:');
    expect(text).toContain('Producer initials:');
  });

  it('repeats farm name and crop year in the header identity and every page footer', () => {
    generate([row({})]);

    const text = pdf.allText();
    expect(text).toContain('FSA-578 ACREAGE REPORTING WORKSHEET');
    expect(text).toContain('Farm: Test Farm');
    expect(text).toContain('Crop year: 2026');
    // Blank producer/county/state placeholders when metadata is missing.
    expect(text).toContain('Producer: ________________');

    // Sections 2-4 each add a page: 4 pages total, each with identity + Page X of Y.
    const footers = pdf.texts().filter(t => t.startsWith('AcreLedger | Test Farm | Crop year 2026'));
    expect(footers).toHaveLength(4);
    for (let page = 1; page <= 4; page += 1) {
      expect(text).toContain(`Page ${page} of 4`);
    }
  });

  it('includes crop/use totals, farm/tract totals, and total cropland in reconciliation', () => {
    generate([row({}), row({ id: 'row-2', fieldNumber: '2', fieldName: 'South 40', acreage: 40, crop: 'Soybeans' })]);

    const tables = pdf.autoTables();
    expect(tables[1].body).toContainEqual(['Corn / Grain', 80]);
    expect(tables[1].body).toContainEqual(['Soybeans / Grain', 40]);
    expect(tables[1].body).toContainEqual(['TOTAL CROPLAND REPORTED', 120]);
    expect(tables[2].body).toContainEqual(['Farm 100 / Tract 200', 120]);
  });

  it('displays dated rows without explicit status as Planted and undated hay as Existing stand', () => {
    const dated = row({ id: 'row-1' });
    const hay = row({ id: 'row-2', fieldNumber: '2', date: '', crop: 'Hay', intendedUse: 'Hay' });
    generate([dated, hay]);

    const entryBody = pdf.autoTables()[0].body;
    expect(entryBody[0][5]).toBe('Planted');
    expect(entryBody[1][5]).toBe('Existing stand');
  });

  it('saves the worksheet with the requested filename', () => {
    generate([row({})]);

    expect(pdf.savedAs()).toEqual(['fsa578.pdf']);
    expect(pdf.sharePdf).not.toHaveBeenCalled();
  });
});
