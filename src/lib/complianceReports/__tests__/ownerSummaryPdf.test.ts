import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsPdfMock } from '@/test/jspdfMock';

import type { LandlordSummary } from '../generateLandlordSummary';

const pdf = createJsPdfMock();
vi.doMock('jspdf', () => ({ default: pdf.JsPdf }));
vi.doMock('jspdf-autotable', () => ({ default: pdf.autoTable }));
vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.doMock('@/lib/native', () => ({ native: { sharePdf: pdf.sharePdf } }));

let exportOwnerSummaryPdf: typeof import('../ownerSummaryPdf').exportOwnerSummaryPdf;
beforeAll(async () => {
  ({ exportOwnerSummaryPdf } = await import('../ownerSummaryPdf'));
});

const summary: LandlordSummary = {
  landlordName: 'Farm Owner',
  generatedAt: '',
  seasonYear: 2026,
  fields: [
    { fieldId: 'f1', fieldName: 'North', acres: 10, landlordName: 'John Smith', crop: 'Corn', totalBushels: 1000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 330 },
    { fieldId: 'f2', fieldName: 'South', acres: 20, crop: 'Soybeans', totalBushels: 600, buPerAcre: 30, totalBales: 0, landlordShareBushels: 0 },
    { fieldId: 'f4', fieldName: 'Pasture', acres: 15, crop: 'Hay', totalBushels: 0, buPerAcre: null, totalBales: 150, landlordShareBushels: 0 },
    { fieldId: 'f5', fieldName: 'Timber', acres: 8, crop: null, totalBushels: 0, buPerAcre: null, totalBales: 0, landlordShareBushels: 0 },
  ],
  activity: [
    { fieldId: 'f1', fieldName: 'North', sortKey: 1, date: '04/20/2026', activityType: 'plant', crop: 'Corn', detail: 'Seed: P1197' },
    { fieldId: 'f1', fieldName: 'North', sortKey: 2, date: '05/13/2026', activityType: 'spray', crop: 'Corn', detail: 'Durus 3.5qt/ac' },
    { fieldId: 'f4', fieldName: 'Pasture', sortKey: 3, date: '07/08/2026', activityType: 'hay', crop: 'Hay', detail: '150 round bales · Cutting 1', quantity: 150 },
    { fieldId: 'f1', fieldName: 'North', sortKey: 4, date: '09/16/2026', activityType: 'harvest', crop: 'Corn', detail: '1,000 bu', quantity: 1000 },
    { fieldId: 'f2', fieldName: 'South', sortKey: 5, date: '10/10/2026', activityType: 'harvest', crop: 'Soybeans', detail: '600 bu', quantity: 600 },
  ],
  cropTotals: [
    { crop: 'Corn', acres: 10, totalBushels: 1000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 330 },
    { crop: 'Soybeans', acres: 20, totalBushels: 600, buPerAcre: 30, totalBales: 0, landlordShareBushels: 0 },
    { crop: 'Hay', acres: 15, totalBushels: 0, buPerAcre: null, totalBales: 150, landlordShareBushels: 0 },
  ],
  missingShareHarvests: 0,
  totals: { acres: 53, totalBales: 150 },
};

const base = {
  summary,
  farmName: 'Egbert Farm',
  seasonYear: 2026,
  reportDate: '11/17/2026',
  fileName: 'Farm_Owner_Summary_2026.pdf',
};

const heads = () => pdf.autoTables().map(t => (t.head[0] as string[])[0] + '|' + (t.head[0] as string[]).slice(-1)[0]);

describe('exportOwnerSummaryPdf', () => {
  beforeEach(() => pdf.reset());

  it('prints the farm name, crop year and one tile per crop', () => {
    exportOwnerSummaryPdf({ ...base, includeTimeline: true });

    const text = pdf.allText();
    expect(text).toContain('FARM OWNER SUMMARY · 2026 CROP YEAR');
    expect(text).toContain('Egbert Farm');
    expect(text).toContain('Generated 11/17/2026');
    expect(text).toContain('Latest harvest load: 10/10/2026');
    expect(text).toContain('CORN');
    expect(text).toContain('SOYBEANS');
    expect(text).toContain('150 bales');
    expect(text).toContain('Landlord 330 · Yours 670');
    // Bushels of different crops are never added together.
    expect(text).not.toContain('1,600');
  });

  it('draws grain tables with share %, owned land, and season columns', () => {
    exportOwnerSummaryPdf({ ...base, includeTimeline: false });

    const [corn, soy] = pdf.autoTables();
    expect(corn.head[0]).toEqual(['FIELD', 'ACRES', 'BUSHELS', 'BU/AC', 'SHARE %', 'LANDLORD BU', 'YOUR BU', 'PLANTED', 'HARVESTED', 'VARIETY']);
    expect(corn.body[0]).toEqual(['North', '10', '1,000', '100.0', '33.0%', '330', '670', '04/20/2026', '09/16/2026', 'P1197']);
    expect(corn.foot?.[0]?.[0]).toBe('Total Corn');
    expect(soy.body[0][4]).toBe('Owned');
    expect(soy.body[0][5]).toBe('—');
  });

  it('summary only: production and hay tables, the not-harvested list, then the sign-off, with no timeline', () => {
    exportOwnerSummaryPdf({ ...base, includeTimeline: false });

    expect(heads()).toEqual(['FIELD|VARIETY', 'FIELD|VARIETY', 'FIELD|BALES/AC']);
    const text = pdf.allText();
    expect(text).toContain('Not harvested');
    expect(text).toContain('1 field · 8 ac');
    expect(text).toContain('Timber (8 ac)');
    expect(text).not.toContain('Activity timeline');
    expect(text).toContain('Summary · no activity timeline');
    expect(text).toContain('Owner signature:');
    expect(text).toContain('Share % is landlord bushels divided by total bushels.');
    expect(pdf.addPageCount()).toBe(0);
  });

  it('full report: adds the grouped timeline and the harvest rollup on a new page', () => {
    exportOwnerSummaryPdf({ ...base, includeTimeline: true });

    expect(heads()).toEqual([
      'FIELD|VARIETY', 'FIELD|VARIETY', 'FIELD|BALES/AC',
      'DATE|SEED', 'DATE|PRODUCTS & RATES', 'FIELD|AVG LOAD',
    ]);
    expect(pdf.addPageCount()).toBeGreaterThanOrEqual(1);
    const tables = pdf.autoTables();
    const rollup = tables[tables.length - 1];
    expect(rollup.body[0]).toEqual(['North', 'Corn', '09/16/2026', '1', '1', '1,000', '1,000']);
    expect(pdf.allText()).toContain('Activity timeline');
  });

  it('keeps the AcreLedger note and footer, and saves under the given name', () => {
    exportOwnerSummaryPdf({ ...base, includeTimeline: false });

    const text = pdf.allText();
    expect(text).toContain('Start your own at acreledger.app');
    expect(text).toContain('Made with AcreLedger · acreledger.app | Egbert Farm · Farm Owner Summary 2026');
    expect(text).toContain('Page 1 of 1');
    expect(pdf.savedAs()).toEqual(['Farm_Owner_Summary_2026.pdf']);
  });

  it('flags harvests with no crop-share percent', () => {
    exportOwnerSummaryPdf({ ...base, summary: { ...summary, missingShareHarvests: 2 }, includeTimeline: false });

    expect(pdf.allText()).toContain('2 harvest record(s) have no crop-share percent and are counted as 0 share.');
  });
});
