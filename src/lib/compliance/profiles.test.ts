import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_PROFILES,
  defaultProfileForCountry,
  getComplianceProfile,
  getComplianceProfileFor,
  requiredFieldLabels,
  resolveComplianceProfileId,
} from '../compliance/profiles';
import {
  sprayProductsNeedReview,
  sprayRecordNeedsReview,
  missingComplianceFields,
} from '../sprayCompliance';
import type { SprayRecord } from '@/types/farm';

describe('resolveComplianceProfileId', () => {
  it("resolves 'universal' to us-epa (legacy placeholder)", () => {
    expect(resolveComplianceProfileId('universal')).toBe('us-epa');
  });

  it("resolves 'us-epa' to itself", () => {
    expect(resolveComplianceProfileId('us-epa')).toBe('us-epa');
  });

  it("resolves 'au-apvma' to itself", () => {
    expect(resolveComplianceProfileId('au-apvma')).toBe('au-apvma');
  });

  it('resolves null, undefined, and empty string to us-epa', () => {
    expect(resolveComplianceProfileId(null)).toBe('us-epa');
    expect(resolveComplianceProfileId(undefined)).toBe('us-epa');
    expect(resolveComplianceProfileId('')).toBe('us-epa');
  });

  it('resolves unknown values to us-epa (safe default)', () => {
    expect(resolveComplianceProfileId('eu-whatever')).toBe('us-epa');
  });
});

describe('defaultProfileForCountry', () => {
  it('defaults US to us-epa', () => {
    expect(defaultProfileForCountry('US')).toBe('us-epa');
  });

  it('defaults AU to au-apvma', () => {
    expect(defaultProfileForCountry('AU')).toBe('au-apvma');
  });
});

describe('COMPLIANCE_PROFILES registry', () => {
  it('has exactly the two pilot profiles', () => {
    expect(Object.keys(COMPLIANCE_PROFILES).sort()).toEqual(['au-apvma', 'us-epa']);
  });

  it('us-epa pins the legacy US field set and labels', () => {
    const profile = getComplianceProfile('us-epa');
    expect(profile.country).toBe('US');
    expect(requiredFieldLabels('us-epa')).toEqual([
      'Product name(s)',
      'Start time',
      'End time',
      'Weather data',
      'Cert. applicator',
      'License #',
      'Wind direction',
      'Crop / site treated',
      'Application method',
      'Equipment ID',
      'EPA Reg # (one or more products)',
      'Application rate (one or more products)',
    ]);
    expect(profile.productChecks).toEqual({
      requireName: true,
      requireRegistrationNumber: true,
      requireRate: true,
    });
  });

  it('au-apvma carries the NSW EPA field set with Australian terms', () => {
    const profile = getComplianceProfile('au-apvma');
    expect(profile.country).toBe('AU');
    const labels = requiredFieldLabels('au-apvma');
    // Spot-check the pilot-critical fields and AU terminology.
    for (const label of [
      'Property / PIC',
      'Paddock name/number',
      'Treated area (ha)',
      'Finish time',
      'Sensitive areas / buffers',
    ]) {
      expect(labels).toContain(label);
    }
    // No US-specific fields leak into the AU profile.
    expect(labels).not.toContain('License #');
    expect(labels).not.toContain('EPA Reg # (one or more products)');
  });

  it('getComplianceProfileFor resolves stored values to registry entries', () => {
    expect(getComplianceProfileFor('universal').id).toBe('us-epa');
    expect(getComplianceProfileFor('au-apvma').id).toBe('au-apvma');
    expect(getComplianceProfileFor(null).id).toBe('us-epa');
  });
});

function product(overrides: Record<string, unknown> = {}) {
  return { product: 'Test', rate: '1', rateUnit: 'qt/ac', epaRegNumber: '1-2', ...overrides };
}

function recordWith(
  products: ReturnType<typeof product>[],
  complianceProfile?: string,
): SprayRecord {
  return {
    id: 'spray-1', fieldId: 'field-1', fieldName: 'North', timestamp: 1,
    windSpeed: 2, applicatorName: 'Farmer',
    products, complianceProfile,
  } as SprayRecord;
}

describe('sprayProductsNeedReview with profiles', () => {
  it('us-epa flags a product missing the EPA reg number (legacy behavior)', () => {
    expect(sprayProductsNeedReview([product({ epaRegNumber: '' })], 'us-epa')).toBe(true);
    expect(sprayProductsNeedReview([product({ epaRegNumber: '' })], 'universal')).toBe(true);
    expect(sprayProductsNeedReview([product({ epaRegNumber: '' })])).toBe(true);
  });

  it('au-apvma does not flag a product missing the reg number', () => {
    expect(sprayProductsNeedReview([product({ epaRegNumber: '' })], 'au-apvma')).toBe(false);
  });

  it('au-apvma still flags a missing name or rate', () => {
    expect(sprayProductsNeedReview([product({ product: '  ' })], 'au-apvma')).toBe(true);
    expect(sprayProductsNeedReview([product({ rate: '' })], 'au-apvma')).toBe(true);
  });

  it('accepts a complete product under either profile', () => {
    expect(sprayProductsNeedReview([product()], 'us-epa')).toBe(false);
    expect(sprayProductsNeedReview([product()], 'au-apvma')).toBe(false);
  });
});

describe('sprayRecordNeedsReview with profiles (US regression)', () => {
  it("treats a 'universal' record as us-epa (EPA reg number required)", () => {
    const record = recordWith([product({ epaRegNumber: '' })], 'universal');
    expect(sprayRecordNeedsReview(record)).toBe(true);
  });

  it('treats a record with no profile as us-epa', () => {
    const record = recordWith([product({ epaRegNumber: '' })]);
    expect(sprayRecordNeedsReview(record)).toBe(true);
  });

  it("does not flag an au-apvma record missing only the reg number", () => {
    const record = {
      id: 'spray-au', fieldId: 'field-1', fieldName: 'Paddock 1', timestamp: 1,
      windSpeed: 10, applicatorName: 'Jack',
      sprayDate: '2026-10-01', startTime: '06:00', endTime: '08:00',
      pic: 'NABC1234', cropOrSiteTreated: 'Wheat', targetPest: 'Ryegrass',
      treatedAreaSize: 40, waterRate: '100', equipmentId: 'Sprayer 1',
      windDirection: 'NW', sensitiveAreaCheck: true,
      products: [product({ epaRegNumber: '' })],
      complianceProfile: 'au-apvma',
    } as SprayRecord;
    expect(sprayRecordNeedsReview(record)).toBe(false);
  });

  it('still honors the stored nonCompliant flag under any profile', () => {
    const usRecord = { ...recordWith([product()], 'us-epa'), nonCompliant: true } as SprayRecord;
    const auRecord = { ...recordWith([product()], 'au-apvma'), nonCompliant: true } as SprayRecord;
    expect(sprayRecordNeedsReview(usRecord)).toBe(true);
    expect(sprayRecordNeedsReview(auRecord)).toBe(true);
  });
});

describe('missingComplianceFields (P1)', () => {
  function auRecord(overrides: Record<string, unknown> = {}): SprayRecord {
    return {
      id: 'spray-au', fieldId: 'f1', fieldName: 'Paddock 1', timestamp: 1,
      windSpeed: 10, applicatorName: 'Jack',
      sprayDate: '2026-10-01', startTime: '06:00', endTime: '08:00',
      pic: 'NABC1234', cropOrSiteTreated: 'Wheat', targetPest: 'Ryegrass',
      treatedAreaSize: 40, waterRate: '100', equipmentId: 'Sprayer 1',
      windDirection: 'NW', sensitiveAreaCheck: true,
      products: [{ product: 'Glyphosate', rate: '1', rateUnit: 'L/ha' }],
      complianceProfile: 'au-apvma',
      ...overrides,
    } as SprayRecord;
  }

  it('returns no missing fields for a complete AU record', () => {
    expect(missingComplianceFields(auRecord(), 'au-apvma')).toEqual([]);
  });

  it('flags missing PIC, treated area, and water rate on an AU record', () => {
    const missing = missingComplianceFields(
      auRecord({ pic: '', treatedAreaSize: 0, waterRate: '' }),
      'au-apvma',
    );
    expect(missing).toContain('Property / PIC');
    expect(missing).toContain('Treated area (ha)');
    expect(missing).toContain('Water rate');
  });

  it('sprayRecordNeedsReview flags an AU record missing required details', () => {
    // Valid product, flag false — but PIC absent.
    const record = auRecord({ pic: '' });
    expect(sprayRecordNeedsReview(record)).toBe(true);
  });

  it('sprayRecordNeedsReview passes a complete AU record', () => {
    expect(sprayRecordNeedsReview(auRecord())).toBe(false);
  });

  it('US records are unaffected by AU-only fields', () => {
    const usRecord = {
      id: 'spray-us', fieldId: 'f1', fieldName: 'North 40', timestamp: 1,
      windSpeed: 5, applicatorName: 'Farmer', licenseNumber: '123',
      startTime: '06:00', endTime: '08:00', cropOrSiteTreated: 'Corn',
      applicationMethod: 'Ground', equipmentId: 'Sprayer',
      windDirection: 'N',
      products: [{ product: 'Atrazine', rate: '1', rateUnit: 'qt/ac', epaRegNumber: '1-2' }],
      complianceProfile: 'universal',
    } as SprayRecord;
    expect(missingComplianceFields(usRecord, 'us-epa')).toEqual([]);
    expect(sprayRecordNeedsReview(usRecord)).toBe(false);
  });
});
