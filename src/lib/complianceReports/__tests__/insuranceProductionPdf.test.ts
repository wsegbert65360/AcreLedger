import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsPdfMock } from '@/test/jspdfMock';
import type { InsuranceProductionReport } from '../insuranceProduction';

const pdf = createJsPdfMock();
vi.doMock('jspdf', () => ({ default: pdf.JsPdf }));
vi.doMock('jspdf-autotable', () => ({ default: pdf.autoTable }));
vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.doMock('@/lib/native', () => ({ native: { sharePdf: pdf.sharePdf } }));

let exportInsuranceProductionPdf: typeof import('../insuranceProductionExport').exportInsuranceProductionPdf;
beforeAll(async () => {
  ({ exportInsuranceProductionPdf } = await import('../insuranceProductionExport'));
});

const report: InsuranceProductionReport = {
  cropYear: 2026,
  issues: [{ id: 'x', severity: 'warning', kind: 'not-harvested', message: 'South: Corn was planted but has no harvest loads.' }],
  units: [{
    key: '29083|corn', county: 'Henry, MO', countyFips: '29083', crop: 'Corn',
    plantedAcres: 120, harvestedAcres: 80, preventedAcres: 0, production: 16000, soldBushels: 8000, storedBushels: 8000,
    yield: 133.3, averageMoisture: 15, estimated: false, types: ['P1197'],
    practices: [{ practice: 'Non-Irrigated', plantedAcres: 120, harvestedAcres: 80, production: 16000, yield: 133.3 }],
    farms: [{ farmNumber: '1234', tracts: ['55'], plantedAcres: 120, production: 16000, yield: 133.3 }],
    loads: [{ id: 'l1', date: '2026-10-01', fieldId: 'n', fieldName: 'North', crop: 'Corn', farmNumber: '1234', tractNumber: '55',
      practice: 'Non-Irrigated', disposition: 'Sold', reference: 'T-1', moisturePercent: 15, bushels: 16000, loadBushels: 16000, estimated: false }],
  }],
};

describe('exportInsuranceProductionPdf', () => {
  beforeEach(() => pdf.reset());

  it('prints units, farm breakdown, loads, items to check and the insured signature line', () => {
    exportInsuranceProductionPdf({ report, metadata: { farmName: 'QA Farm', cropYear: 2026, reportDate: '2026-11-19' }, fileName: 'ins.pdf' });

    const tables = pdf.autoTables();
    expect(tables.map(t => (t.head[0] as string[])[0])).toEqual(['COUNTY', 'COUNTY', 'DATE', 'PRIORITY']);
    expect(tables[0].body[0]).toEqual(['Henry, MO', 'Corn', 'Non-Irrigated', '120', '80', '16,000', '8,000', '8,000', '133.3', '15', '']);
    expect(tables[1].body[0]).toEqual(['Henry, MO', 'Corn', '1234', '55', '120', '16,000', '133.3']);
    const text = pdf.allText();
    expect(text).toContain('CROP INSURANCE PRODUCTION WORKSHEET');
    expect(text).toContain('Insured / farm: QA Farm');
    expect(text).toContain('Not an official insurance form.');
    expect(text).toContain('Insured signature:');
    expect(text).not.toMatch(/\$|free trial|sign up/i);
    expect(pdf.savedAs()).toEqual(['ins.pdf']);
  });
});
