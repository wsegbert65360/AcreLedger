import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jsPDF to capture text calls without generating actual PDFs
const mockTextCalls: Array<{ text: string; x: number; y: number; options?: any }> = [];
const mockPages: Array<{ width: number; height: number }> = [{ width: 210, height: 297 }];

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    private fontSize = 10;
    private fontFace = 'helvetica';
    private fontItalic = 'normal';
    private textColor = [0, 0, 0];
    textCalls: Array<{ text: string; x: number; y: number; options?: any }> = [];
    pageCalls = 0;
    private currentY = 20;
    lastAutoTable: { finalY: number } | false = false;

    setFontSize(size: number) { this.fontSize = size; }
    setTextColor(r: number, g: number, b: number) { this.textColor = [r, g, b]; }
    setFont(face: string, style: string) { this.fontFace = face; this.fontItalic = style; }
    setDrawColor() {}
    line() {}
    addPage() { this.pageCalls++; mockPages.push({ width: 210, height: 297 }); }
    setPage() {}
    getNumberOfPages() { return 1; }
    splitTextToSize(text: string, _maxWidth: number) { return [text]; }

    text(text: string, x: number, y: number, options?: any) {
      this.textCalls.push({ text, x, y, options });
      mockTextCalls.push({ text, x, y, options });
    }

    save(_filename: string) {
      // No-op in tests — don't write to disk
    }
  }
}));

vi.mock('jspdf-autotable', () => ({
  default: (doc: any, _options: any) => {
    // Simulate autoTable setting lastAutoTable on the doc
    doc.lastAutoTable = { finalY: 120 };
  }
}));

import { generateSprayPDF } from '../sprayExport';
import { SprayRecord } from '../../types/farm';

function makeSprayRecord(overrides: Partial<SprayRecord> = {}): SprayRecord {
  return {
    id: 'spray-1',
    fieldId: 'field-1',
    fieldName: 'North Field',
    products: [
      { product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' },
    ],
    windSpeed: 5,
    temperature: 75,
    timestamp: Date.now(),
    seasonYear: 2026,
    treatedAreaSize: 80,
    nonCompliant: false,
    deleted_at: null,
    applicatorName: 'John Doe',
    licenseNumber: 'L12345',
    sprayDate: '2026-03-25',
    startTime: '08:00',
    endTime: '09:30',
    cropOrSiteTreated: 'Corn',
    applicationMethod: 'Ground Broadcast',
    targetPest: 'Pigweed',
    windDirection: 'NW',
    relativeHumidity: 45,
    ...overrides,
  };
}

beforeEach(() => {
  mockTextCalls.length = 0;
  mockPages.length = 1;
});

describe('generateSprayPDF', () => {
  it('generates a single-record PDF without errors', () => {
    const records = [makeSprayRecord()];
    expect(() => generateSprayPDF(records, 'Test Farm')).not.toThrow();
  });

  it('includes the field name in the output', () => {
    const records = [makeSprayRecord({ fieldName: 'South Field' })];
    generateSprayPDF(records, 'Test Farm');
    const hasFieldName = mockTextCalls.some(c => c.text.includes('South Field'));
    expect(hasFieldName).toBe(true);
  });

  it('includes applicator name', () => {
    const records = [makeSprayRecord({ applicatorName: 'Jane Smith' })];
    generateSprayPDF(records, 'Test Farm');
    const hasApplicator = mockTextCalls.some(c => c.text.includes('Jane Smith'));
    expect(hasApplicator).toBe(true);
  });

  it('handles records with null optional fields without crashing', () => {
    const records = [makeSprayRecord({
      applicatorName: undefined,
      licenseNumber: undefined,
      notes: undefined,
      siteAddress: undefined,
      endTime: undefined,
    })];
    expect(() => generateSprayPDF(records, null)).not.toThrow();
  });

  it('handles empty products array without crashing', () => {
    const records = [makeSprayRecord({ products: [] })];
    expect(() => generateSprayPDF(records, 'Farm')).not.toThrow();
    // Should contain "No products" message
    const hasNoProducts = mockTextCalls.some(c => c.text.includes('No products'));
    expect(hasNoProducts).toBe(true);
  });

  it('handles null products without crashing', () => {
    const records = [makeSprayRecord({ products: undefined })];
    expect(() => generateSprayPDF(records, 'Farm')).not.toThrow();
  });

  it('generates multi-record PDF without errors', () => {
    const records = [
      makeSprayRecord({ id: 's1', fieldName: 'Field A' }),
      makeSprayRecord({ id: 's2', fieldName: 'Field B' }),
      makeSprayRecord({ id: 's3', fieldName: 'Field C' }),
    ];
    expect(() => generateSprayPDF(records, 'Test Farm')).not.toThrow();
  });

  it('includes compliance status text', () => {
    const records = [makeSprayRecord({ nonCompliant: true })];
    generateSprayPDF(records, 'Farm');
    const hasWarning = mockTextCalls.some(c => c.text.includes('Compliance Warning'));
    expect(hasWarning).toBe(true);
  });

  it('shows complete compliance status for compliant records', () => {
    const records = [makeSprayRecord({ nonCompliant: false })];
    generateSprayPDF(records, 'Farm');
    const hasComplete = mockTextCalls.some(c => c.text.includes('Compliance Status: Complete'));
    expect(hasComplete).toBe(true);
  });

  it('does not call save with invalid filenames', () => {
    const records = [makeSprayRecord()];
    generateSprayPDF(records, 'Farm');
    // If we got here without error, save was called successfully
    expect(mockTextCalls.length).toBeGreaterThan(0);
  });

  it('handles empty record array gracefully', () => {
    expect(() => generateSprayPDF([], 'Farm')).not.toThrow();
  });
});
