import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createJsPdfMock } from '@/test/jspdfMock';
import type { WorkRequest } from '@/types/farm';

// textWithLink isn't part of the shared jspdfMock. Capture calls on the fake doc
// class instance by patching the prototype after the mock is created.

const pdf = createJsPdfMock();

function makeRequest(fieldCount = 2): WorkRequest {
  return {
    id: 'r1',
    farm_id: 'f1',
    requestNumber: 'WR-2026-AB12CD',
    status: 'Draft',
    createdAt: '2026-07-22T12:00:00.000Z',
    updatedAt: '2026-07-22T12:00:00.000Z',
    customerName: 'Jane Farmer',
    customerPhone: '555-1234',
    customerBillingAddress: '100 Farm Ln',
    providerName: 'Acme Spraying',
    providerEmail: 'applicator@acme.com',
    workType: 'spraying',
    requestedCompletionDate: '2026-08-01',
    crop: 'Corn',
    cropYear: 2026,
    notes: 'Avoid the creek.',
    products: [{ productName: 'Roundup', applicationRate: '32', rateUnit: 'oz/ac', supplier: 'farmer' }],
    fields: Array.from({ length: fieldCount }, (_, i) => ({
      fieldId: `fld${i}`,
      farmName: 'Home Farm',
      fieldName: `Field ${i + 1}`,
      acreage: 40 + i * 10,
      crop: 'Corn',
      gpsLat: 38.5 + i * 0.01,
      gpsLng: -93.2 + i * 0.01,
      navigationLat: 38.5 + i * 0.01,
      navigationLng: -93.2 + i * 0.01,
      nearbyRoad: `County Road ${i + 1}`,
    })),
    timestamp: Date.now(),
    deleted_at: null,
  };
}

let exportWorkRequestPdf: typeof import('./workRequestPdfExport').exportWorkRequestPdf;
let WORK_REQUEST_DISCLAIMER: string;

beforeAll(async () => {
  vi.doMock('jspdf', () => ({ default: pdf.JsPdf }));
  vi.doMock('jspdf-autotable', () => ({ default: pdf.autoTable }));
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
  vi.doMock('@/lib/native', () => ({ native: { sharePdf: pdf.sharePdf } }));

  // Add textWithLink to the fake doc prototype (not in the shared mock).
  (pdf.JsPdf as unknown as { prototype: Record<string, unknown> }).prototype.textWithLink = function (text: string, x: number, y: number, options: { url: string }) {
    // Delegate to the captured `text` so it appears in pdf.texts().
    (this as unknown as { text: (t: string, x: number, y: number) => void }).text(text, x, y);
    (this as unknown as { _linkCalls?: Array<{ text: string; url: string }> })._linkCalls ??= [];
    (this as unknown as { _linkCalls: Array<{ text: string; url: string }> })._linkCalls.push({ text, url: options.url });
  };

  const mod = await import('./workRequestPdfExport');
  exportWorkRequestPdf = mod.exportWorkRequestPdf;
  WORK_REQUEST_DISCLAIMER = mod.WORK_REQUEST_DISCLAIMER;
});

beforeEach(() => {
  pdf.reset();
});

describe('exportWorkRequestPdf', () => {
  it('renders the AcreLedger branding header and request number on the first page', async () => {
    await exportWorkRequestPdf({ request: makeRequest(1) });
    const text = pdf.allText();
    expect(text).toContain('AcreLedger — Work Request');
    expect(text).toContain('WR-2026-AB12CD');
    expect(text).toContain('Status: Draft');
  });

  it('renders customer and provider blocks', async () => {
    await exportWorkRequestPdf({ request: makeRequest(1) });
    const text = pdf.allText();
    expect(text).toContain('Customer');
    expect(text).toContain('Provider');
    expect(text).toContain('Jane Farmer');
    expect(text).toContain('Acme Spraying');
  });

  it('renders the products and acreage autotables', async () => {
    await exportWorkRequestPdf({ request: makeRequest(2) });
    const tables = pdf.autoTables();
    const productsTable = tables.find(t => t.head.flat().some(h => String(h) === 'PRODUCT'));
    const breakdownTable = tables.find(t => t.head.flat().some(h => String(h) === 'FARM'));
    expect(productsTable).toBeDefined();
    expect(breakdownTable).toBeDefined();
    expect(breakdownTable!.body.length).toBe(2); // two fields
  });

  it('keeps field blocks compact so multiple fields can share a page', async () => {
    await exportWorkRequestPdf({ request: makeRequest(2) });
    expect(pdf.images().length).toBe(2);
    // The compact fields fit on the summary page in the deterministic mock;
    // the former layout always added three pages for these two fields.
    expect(pdf.addPageCount()).toBe(0);
    const text = pdf.allText();
    expect(text).toContain('Field 1 of 2: Field 1');
    expect(text).toContain('Field 2 of 2: Field 2');
  });

  it('does not add a dedicated verification page', async () => {
    await exportWorkRequestPdf({ request: makeRequest(1) });

    expect(pdf.addPageCount()).toBe(0);
    expect(pdf.allText()).toContain(WORK_REQUEST_DISCLAIMER);
  });

  it('includes GPS coordinates and nearby road per field', async () => {
    await exportWorkRequestPdf({ request: makeRequest(1) });
    const text = pdf.allText();
    expect(text).toContain('Nearby road: County Road 1');
    expect(text).toMatch(/38\.50\d{3}, -93\.20\d{3}/);
  });

  it('includes the required verification disclaimer', async () => {
    await exportWorkRequestPdf({ request: makeRequest(1) });
    expect(pdf.allText()).toContain(WORK_REQUEST_DISCLAIMER);
  });

  it('renders Page X of Y footers', async () => {
    await exportWorkRequestPdf({ request: makeRequest(1) });
    const text = pdf.allText();
    expect(text).toContain('Page 1 of');
  });

  it('renders a placeholder map when geometry is unavailable', async () => {
    const getGeometry = () => null;
    await exportWorkRequestPdf({ request: makeRequest(1), getGeometry });
    // Still produces an image (the placeholder SVG rasterizes), and the field
    // page still renders its header.
    expect(pdf.images().length).toBe(1);
    expect(pdf.allText()).toContain('Field 1 of 1: Field 1');
  });
});
