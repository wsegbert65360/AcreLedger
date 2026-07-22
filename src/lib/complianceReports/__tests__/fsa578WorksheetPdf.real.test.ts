/**
 * Real-renderer invariant test for the FSA-578 worksheet PDF.
 *
 * Unlike the mock-based suite (fsa578WorksheetPdf.test.ts), this generates an
 * actual multi-page PDF with real jsPDF + jspdf-autotable, so it can prove the
 * layout promises a mock cannot: real pagination, continuation-page headers,
 * per-page footers, and Page X of Y numbering. It must stay deterministic:
 * fixed rows, fixed metadata. The document is captured by subclassing jsPDF
 * and re-assigning the instance-level `save` (jsPDF v4 binds methods per
 * instance, so prototype spying does not work); all rendering stays real.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { jsPDF } from 'jspdf';
import type { Fsa578ReportRow, Fsa578WorksheetMetadata } from '../fsaReports';

let captured: jsPDF | undefined;

vi.doMock('jspdf', async () => {
  const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
  class CapturingJsPdf extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      (this as unknown as { save: () => void }).save = () => {
        captured = this as unknown as jsPDF;
      };
    }
  }
  return { ...actual, default: CapturingJsPdf, jsPDF: CapturingJsPdf };
});

let exportFsa578WorksheetPdf: typeof import('../fsa578PdfExport').exportFsa578WorksheetPdf;
beforeAll(async () => {
  ({ exportFsa578WorksheetPdf } = await import('../fsa578PdfExport'));
});

const metadata: Fsa578WorksheetMetadata = {
  farmName: 'Test Farm',
  cropYear: 2026,
  reportDate: '2026-07-21',
  producerName: 'QA Producer',
  county: 'Benton',
  state: 'MO',
};

function row(index: number): Fsa578ReportRow {
  return {
    id: `row-${index}`,
    fieldId: 'field-1',
    date: '2026-04-15',
    fieldName: `Field ${index}`,
    farmNumber: '100',
    tractNumber: '200',
    fieldNumber: String(index),
    acreage: 40,
    crop: 'Corn',
    seedVariety: 'P1197',
    intendedUse: 'Grain',
    irrigationCode: 'NI',
    producerShare: '100%',
    landUse: 'Cropland',
  };
}

/** Raw PDF text with jsPDF's escaped delimiters normalized for searching. */
function pdfText(doc: jsPDF): string {
  return doc
    .output()
    .replace(/\\([()\\])/g, '$1');
}

describe('exportFsa578WorksheetPdf (real renderer)', () => {
  it('paginates the entry table with repeated headers, footers, and page numbers on every page', () => {
    // 60 rows forces Section 1 onto multiple pages (~36 rows/page in landscape).
    const rows = Array.from({ length: 60 }, (_, i) => row(i + 1));

    exportFsa578WorksheetPdf({ metadata, rows, issues: [], fileName: 'fsa578.pdf' });

    expect(captured).toBeDefined();
    const doc = captured as jsPDF;
    const pageCount = doc.getNumberOfPages();
    // 2+ entry pages + reconciliation + review + all-CLU reference.
    expect(pageCount).toBeGreaterThanOrEqual(4);

    const text = pdfText(doc);

    // Continuation-page header proves real autoTable pagination re-drew Section 1.
    expect(text).toContain('SECTION 1 - CROPLAND REPORTING ROWS (continued)');

    // Every page carries the numbered footer and the farm/crop-year identity.
    for (let page = 1; page <= pageCount; page += 1) {
      expect(text).toContain(`Page ${page} of ${pageCount}`);
    }
    const farmOccurrences = text.split('Test Farm').length - 1;
    expect(farmOccurrences).toBeGreaterThanOrEqual(pageCount);

    // Continuation pages still carry entry-table content, not just headers.
    expect(text).toContain('Field 60');
  });
});
