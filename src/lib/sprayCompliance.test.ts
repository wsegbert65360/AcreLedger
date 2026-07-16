import { describe, expect, it } from 'vitest';
import { sprayRecordNeedsReview } from './sprayCompliance';
import type { SprayRecord } from '@/types/farm';

function recordWithProduct(overrides: Record<string, unknown> = {}): SprayRecord {
  return {
    id: 'spray-1', fieldId: 'field-1', fieldName: 'North', timestamp: 1,
    windSpeed: 2, temperature: 70, applicatorName: 'Farmer', licenseNumber: '123',
    products: [{ product: 'Test', rate: '1', rateUnit: 'qt/ac', epaRegNumber: '1-2', ...overrides }],
  } as SprayRecord;
}

describe('sprayRecordNeedsReview', () => {
  it('derives review status for a legacy blank rate without changing the row', () => {
    const record = recordWithProduct({ rate: '' });
    const original = structuredClone(record);
    expect(sprayRecordNeedsReview(record)).toBe(true);
    expect(record).toEqual(original);
  });

  it('accepts a complete product when the stored flag is false', () => {
    expect(sprayRecordNeedsReview(recordWithProduct())).toBe(false);
  });
});
