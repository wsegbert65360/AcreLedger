import { describe, expect, it } from 'vitest';

import {
  collectKnownFsaTracts,
  createFsaOfficeRequestSheet,
  FSA_BOUNDARY_REQUEST_TEXT,
} from '@/lib/fsaOfficeRequestSheet';

function pdfText(doc: ReturnType<typeof createFsaOfficeRequestSheet>): string {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')));
  // jsPDF emits each wrapped line as its own (…) string; join fragments back
  // into sentences so multi-line wording can be asserted contiguously.
  const chunks = raw.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
  return chunks
    .map(chunk => chunk.slice(1, -1).replace(/\\([()\\])/g, '$1'))
    .join(' ')
    .replace(/\s+/g, ' ');
}

describe('FSA office request sheet', () => {
  it('uses the canonical boundary request wording shared by screen, clipboard, and PDF', () => {
    expect(FSA_BOUNDARY_REQUEST_TEXT).toBe(
      'I use AcreLedger for my farm records. Please give me the digital file or files containing my current FSA Common Land Unit field boundaries for every farm and tract I operate. GeoJSON or ESRI shapefile ZIP files are both okay. Please include the farm number, tract number, field or CLU number, and calculated acres when available.',
    );

    const doc = createFsaOfficeRequestSheet({ save: false });
    const text = pdfText(doc);
    expect(text).toContain('FSA FIELD FILE REQUEST');
    expect(text).toContain('I use AcreLedger for my farm records');
    expect(text).toContain('Common Land Unit field boundaries');
    expect(text).toContain('GeoJSON or ESRI shapefile ZIP files are both okay');
  });

  it('renders the required sheet sections in order on one US-letter page', () => {
    const doc = createFsaOfficeRequestSheet({ save: false });
    const text = pdfText(doc);

    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(215.9, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(279.4, 1);

    const sections = [
      'What I need from FSA',
      'Please include:',
      'Also helpful:',
      'How to send it',
      'FSA office notes',
    ];
    let last = -1;
    for (const section of sections) {
      const index = text.indexOf(section);
      expect(index, `missing section ${section}`).toBeGreaterThan(-1);
      expect(index).toBeGreaterThan(last);
      last = index;
    }

    expect(text).toContain('Farm number');
    expect(text).toContain('Tract number');
    expect(text).toContain('Field or CLU number');
    expect(text).toContain('Calculated acres');
    expect(text).toContain('Current farm and tract map');
    expect(text).toContain('FSA-156EZ');
    expect(text).toContain('FSA-578');
    expect(text).toContain('A paper map or picture alone cannot be imported');
    expect(text).toContain('USB drive');
    expect(text).toContain('support@acreledger.com');
  });

  it('prints provided contact values and leaves unknown values blank', () => {
    const filled = createFsaOfficeRequestSheet({
      save: false,
      operatorName: 'John Doe',
      farmName: 'Doe Farms LLC',
      countyState: 'Benton County, MO',
      contact: 'john@example.com',
    });
    const filledText = pdfText(filled);
    expect(filledText).toContain('John Doe');
    expect(filledText).toContain('Doe Farms LLC');
    expect(filledText).toContain('Benton County, MO');
    expect(filledText).toContain('john@example.com');

    const blank = createFsaOfficeRequestSheet({ save: false });
    const blankText = pdfText(blank);
    expect(blankText).toContain('Operator name:');
    expect(blankText).toContain('County and state:');
    expect(blankText).toContain('Phone or email:');
    expect(blankText).not.toContain('John Doe');
    expect(blankText).not.toContain('john@example.com');
  });

  it('lists known farm/tract numbers without implying completeness', () => {
    const doc = createFsaOfficeRequestSheet({
      save: false,
      knownTracts: ['4251-9747', '6418-1417'],
    });
    const text = pdfText(doc);
    expect(text).toContain('Farm and tract numbers already in AcreLedger');
    expect(text).toContain('4251-9747');
    expect(text).toContain('6418-1417');
    expect(text).toContain('not be a complete list');
  });

  it('caps a long tract list and stays exactly one page', () => {
    const manyTracts = Array.from({ length: 200 }, (_, i) => `1000-${1000 + i}`);
    const doc = createFsaOfficeRequestSheet({
      save: false,
      operatorName: 'John Doe',
      farmName: 'Doe Farms LLC',
      countyState: 'Benton County, MO',
      contact: 'john@example.com',
      knownTracts: manyTracts,
    });

    expect(doc.getNumberOfPages()).toBe(1);
    const text = pdfText(doc);
    expect(text).toContain('plus 186 more');
    expect(text).not.toContain('1000-1199');
    expect(text).toContain('FSA office notes');
  });
});

describe('collectKnownFsaTracts', () => {
  it('deduplicates tract keys from active fields and handles combined farm formats', () => {
    const keys = collectKnownFsaTracts([
      { fsaFarmNumber: '6418', fsaTractNumber: '1417', deleted_at: null },
      { fsaFarmNumber: '6418-1417/7653-12050', deleted_at: null },
      { fsaFarmNumber: '6418', fsaTractNumber: '1417', deleted_at: null },
    ]);
    expect(keys).toEqual(['6418-1417', '7653-12050']);
  });

  it('excludes soft-deleted fields and fields without FSA numbers', () => {
    const keys = collectKnownFsaTracts([
      { fsaFarmNumber: '6418', fsaTractNumber: '1417', deleted_at: '2026-09-01T00:00:00Z' },
      { deleted_at: null },
      { fsaFarmNumber: '4251', fsaTractNumber: '9747', deleted_at: null },
    ]);
    expect(keys).toEqual(['4251-9747']);
  });
});
