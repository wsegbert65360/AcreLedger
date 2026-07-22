import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsPdfMock } from '@/test/jspdfMock';
import type { Field, SprayRecord } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';

const pdf = createJsPdfMock();
vi.doMock('jspdf', () => ({ default: pdf.JsPdf }));
vi.doMock('jspdf-autotable', () => ({ default: pdf.autoTable }));
vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.doMock('@/lib/native', () => ({ native: { sharePdf: pdf.sharePdf } }));

let generateSprayPDF: typeof import('../sprayExport').generateSprayPDF;
beforeAll(async () => {
  ({ generateSprayPDF } = await import('../sprayExport'));
});

const PNG_ATTACHMENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG_ATTACHMENT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP==';

function makeRecord(overrides: Partial<SprayRecord> = {}): SprayRecord {
  return {
    id: 'spray-1',
    fieldId: 'field-1',
    fieldName: 'North Field',
    products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' }],
    windSpeed: 5,
    temperature: 75,
    relativeHumidity: 45,
    timestamp: 1000,
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
    applicatorName: 'Cert Applicator',
    licenseNumber: 'L12345',
    sprayDate: '2026-05-01',
    startTime: '08:00',
    endTime: '09:00',
    cropOrSiteTreated: 'Corn',
    applicationMethod: 'Ground Broadcast',
    treatedAreaSize: 80,
    treatedAreaUnit: 'ac',
    windDirection: 'NW',
    nonCompliant: false,
    ...overrides,
  };
}

const field: Field = {
  id: 'field-1',
  name: 'North Field',
  acreage: 80,
  lat: null,
  lng: null,
  farm_id: 'farm-1',
  deleted_at: null,
};

function makeCluAssignment(acres: number): FieldCluAssignment {
  return {
    id: 'assignment-1',
    farmId: 'farm-1',
    fieldId: 'field-1',
    tractKey: '100-200',
    cluNumber: '1',
    acres,
    landUse: 'cropland',
    assignedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };
}

describe('generateSprayPDF', () => {
  beforeEach(() => pdf.reset());

  it('renders the multi-record header and one product table per record', () => {
    const second = makeRecord({
      id: 'spray-2',
      sprayDate: '2026-05-03',
      timestamp: 2000,
      products: [
        { product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' },
        { product: 'Dicamba', rate: '8', rateUnit: 'oz/ac', epaRegNumber: '100-1023' },
      ],
    });

    generateSprayPDF([makeRecord(), second], 'Test Farm', { fields: [field] });

    const text = pdf.allText();
    expect(text).toContain('AcreLedger Spray Log Export');
    expect(text).toContain('Farm: Test Farm');
    expect(text).toContain('Applications: 2');

    // One products table per record; the tank mix expands to two rows.
    const tables = pdf.autoTables();
    expect(tables).toHaveLength(2);
    expect(tables[1].body).toHaveLength(2);
    expect(tables[1].body[0][0]).toMatchObject({ content: expect.stringContaining('Roundup') });
    expect(tables[1].body[1][0]).toMatchObject({ content: expect.stringContaining('Dicamba') });
    expect(tables[1].body[1][1]).toBe('100-1023');
    expect(tables[1].head[0]).toEqual(['Product / Active Ingredients', 'EPA Reg #', 'Rate', 'Total Applied']);
  });

  it('embeds attachment images and never renders raw attachment tokens or base64', () => {
    const record = makeRecord({
      notes: `Scout noted heavy pressure. [ATTACHMENT:${PNG_ATTACHMENT}]`,
    });

    generateSprayPDF([record], 'Test Farm', { fields: [field] });

    const images = pdf.images();
    expect(images).toHaveLength(1);
    expect(images[0].dataUri).toBe(PNG_ATTACHMENT);
    expect(images[0].format).toBe('PNG');

    const text = pdf.allText();
    expect(text).toContain('Attached Ticket / Label:');
    expect(text).toContain('Scout noted heavy pressure.');
    expect(text).not.toContain('ATTACHMENT');
    expect(text).not.toContain('base64');
  });

  it('detects JPEG attachments for embedding', () => {
    const record = makeRecord({ notes: `[ATTACHMENT:${JPEG_ATTACHMENT}]` });

    generateSprayPDF([record], 'Test Farm', { fields: [field] });

    expect(pdf.images()[0].format).toBe('JPEG');
  });

  it('marks non-compliant records with the compliance warning', () => {
    generateSprayPDF([makeRecord({ nonCompliant: true })], 'Test Farm', { fields: [field] });

    expect(pdf.allText()).toContain('Compliance Warning: Some recommended record details are missing.');
  });

  it('marks records with export-visible omissions as review needed', () => {
    generateSprayPDF([makeRecord({ temperature: undefined as unknown as number })], 'Test Farm', { fields: [field] });

    expect(pdf.allText()).toContain('Review needed - missing temperature');
  });

  it('marks fully populated records complete', () => {
    generateSprayPDF([makeRecord()], 'Test Farm', { fields: [field] });

    expect(pdf.allText()).toContain('Compliance Status: Complete');
  });

  it('falls back to FSA cropland acreage when no treated area is stored', () => {
    const record = makeRecord({ treatedAreaSize: undefined });

    generateSprayPDF([record], 'Test Farm', {
      fields: [field],
      cluAssignments: [makeCluAssignment(55)],
    });

    // CLU cropland (55) wins over the raw field acreage (80).
    expect(pdf.allText()).toContain('Area: 55 ac');
  });

  it('preserves an explicitly stored treated area (spot-spray)', () => {
    const record = makeRecord({ treatedAreaSize: 12.5 });

    generateSprayPDF([record], 'Test Farm', {
      fields: [field],
      cluAssignments: [makeCluAssignment(55)],
    });

    expect(pdf.allText()).toContain('Area: 12.5 ac');
  });

  it('renders a no-products note instead of an empty table', () => {
    generateSprayPDF([makeRecord({ products: [] })], 'Test Farm', { fields: [field] });

    expect(pdf.allText()).toContain('No products recorded for this application.');
    expect(pdf.autoTables()).toHaveLength(0);
  });

  it('draws page footer with page numbers and attribution', () => {
    generateSprayPDF([makeRecord()], 'Test Farm', { fields: [field] });

    const text = pdf.allText();
    expect(text).toContain('Page 1 of 1');
    expect(text).toContain('Generated by AcreLedger');
  });

  it('saves the multi-record export with a sanitized farm and date-range filename', () => {
    const later = makeRecord({ id: 'spray-2', sprayDate: '2026-05-10', timestamp: 2000 });

    generateSprayPDF([makeRecord(), later], 'Test Farm', { fields: [field] });

    expect(pdf.savedAs()).toEqual(['SprayLog_Test_Farm_2026-05-01_to_2026-05-10.pdf']);
    expect(pdf.sharePdf).not.toHaveBeenCalled();
  });

  it('saves a single record with field and date filename', () => {
    generateSprayPDF([makeRecord()], 'Test Farm', { fields: [field] });

    expect(pdf.savedAs()).toEqual(['SprayRecord_North_Field_2026-05-01.pdf']);
  });

  it('appends the .pdf extension to custom filenames that lack it', () => {
    generateSprayPDF([makeRecord()], 'Test Farm', { fields: [field], filename: 'my-export' });

    expect(pdf.savedAs()).toEqual(['my-export.pdf']);
  });
});
