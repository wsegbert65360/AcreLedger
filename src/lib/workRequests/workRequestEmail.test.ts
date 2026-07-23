import { describe, it, expect } from 'vitest';
import { buildWorkRequestMailto, buildMailtoUrl, workTypeLabel, farmNamesForRequest } from './workRequestEmail';
import type { WorkRequest } from '@/types/farm';

function makeRequest(overrides: Partial<WorkRequest> = {}): WorkRequest {
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
    currentCropStage: 'V6',
    previousCrop: 'Soybeans',
    nextPlannedCrop: '',
    notes: 'Avoid the creek crossing.',
    products: [
      { productName: 'Roundup', applicationRate: '32', rateUnit: 'oz/ac', carrierVolume: '10', carrierVolumeUnit: 'gal/ac', applicationMethod: 'Ground boom', supplier: 'farmer' },
    ],
    fields: [
      { fieldId: 'fld1', farmName: 'Home Farm', fieldName: 'North 40', acreage: 40, crop: 'Corn', gpsLat: 38.5, gpsLng: -93.2, navigationLat: 38.5, navigationLng: -93.2, nearbyRoad: 'County Road 5' },
      { fieldId: 'fld2', farmName: 'Home Farm', fieldName: 'South 80', acreage: 80 },
    ],
    timestamp: Date.now(),
    deleted_at: null,
    ...overrides,
  };
}

describe('workTypeLabel', () => {
  it('labels each work type', () => {
    expect(workTypeLabel('spraying')).toBe('Spraying');
    expect(workTypeLabel('fertilizer')).toBe('Fertilizer');
    expect(workTypeLabel('lime')).toBe('Lime');
    expect(workTypeLabel('planting')).toBe('Planting');
    expect(workTypeLabel('harvesting')).toBe('Harvesting');
    expect(workTypeLabel('other')).toBe('Work');
  });
});

describe('farmNamesForRequest', () => {
  it('returns sorted, de-duplicated farm names', () => {
    const req = makeRequest({
      fields: [
        { fieldId: '1', farmName: 'West Farm', fieldName: 'A', acreage: 10 },
        { fieldId: '2', farmName: 'Home Farm', fieldName: 'B', acreage: 10 },
        { fieldId: '3', farmName: 'Home Farm', fieldName: 'C', acreage: 10 },
      ],
    });
    expect(farmNamesForRequest(req)).toEqual(['Home Farm', 'West Farm']);
  });

  it('returns empty when no farm names', () => {
    const req = makeRequest({ fields: [{ fieldId: '1', farmName: '', fieldName: 'A', acreage: 10 }] });
    expect(farmNamesForRequest(req)).toEqual([]);
  });
});

describe('buildWorkRequestMailto', () => {
  it('builds the subject in the required format', () => {
    const { subject } = buildWorkRequestMailto(makeRequest());
    expect(subject).toBe('Work Request – Spraying – Home Farm');
  });

  it('lists multiple farms in the subject separated by commas', () => {
    const req = makeRequest({
      fields: [
        { fieldId: '1', farmName: 'Alpha', fieldName: 'A', acreage: 10 },
        { fieldId: '2', farmName: 'Beta', fieldName: 'B', acreage: 10 },
      ],
    });
    expect(buildWorkRequestMailto(req).subject).toBe('Work Request – Spraying – Alpha, Beta');
  });

  it('includes the request number, customer, and phone in the body', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('WR-2026-AB12CD');
    expect(body).toContain('Customer: Jane Farmer');
    expect(body).toContain('Phone: 555-1234');
  });

  it('includes work type and requested completion date', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('Work type: Spraying');
    expect(body).toContain('Requested completion:');
  });

  it('lists each selected field with its acreage', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('Home Farm — North 40 (40 ac)');
    expect(body).toContain('Home Farm — South 80 (80 ac)');
  });

  it('includes the total acreage', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('Total acreage: 120 ac');
  });

  it('includes a concise product/application summary', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('Roundup');
    expect(body).toContain('@ 32 oz/ac');
    expect(body).toContain('carrier 10 gal/ac');
    expect(body).toContain('provided by farmer');
  });

  it('includes notes when present', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('Avoid the creek crossing.');
  });

  it('references the attached PDF', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('attached PDF');
  });

  it('includes the required verification disclaimer', () => {
    const { body } = buildWorkRequestMailto(makeRequest());
    expect(body).toContain('should be verified before application');
  });

  it('targets the provider email', () => {
    const { to } = buildWorkRequestMailto(makeRequest());
    expect(to).toBe('applicator@acme.com');
  });
});

describe('buildMailtoUrl', () => {
  it('encodes subject and body into a mailto: URL', () => {
    const url = buildMailtoUrl({ to: 'a@b.com', subject: 'Hello There', body: 'Line 1\nLine 2' });
    expect(url.startsWith('mailto:a%40b.com?subject=')).toBe(true);
    expect(url).toContain('body=Line%201');
  });
});
