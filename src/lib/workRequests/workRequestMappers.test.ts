import { describe, it, expect } from 'vitest';
import { mapWorkRequestFromDb, mapWorkRequestToDb } from '@/lib/mappers';
import type { WorkRequest } from '@/types/farm';
import type { WorkRequestRow as WorkRequestRowType } from '@/types/database';

function makeDomain(overrides: Partial<WorkRequest> = {}): WorkRequest {
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
    providerName: 'Acme',
    providerEmail: 'a@b.com',
    workType: 'spraying',
    requestedCompletionDate: '2026-08-01',
    crop: 'Corn',
    cropYear: 2026,
    notes: 'Avoid the creek.',
    products: [{ productName: 'Roundup', applicationRate: '32', rateUnit: 'oz/ac', supplier: 'farmer' }],
    fields: [{
      fieldId: 'fld1', farmName: 'Home Farm', fieldName: 'North 40', acreage: 40,
      gpsLat: 38.5, gpsLng: -93.2, navigationLat: 38.5, navigationLng: -93.2,
      nearbyRoad: 'CR 5', roadSource: 'nominatim',
      overrides: { crop: 'Soybeans', notes: 'override note' },
    }],
    timestamp: 1_789_000_000_000,
    deleted_at: null,
    ...overrides,
  };
}

describe('mapWorkRequestToDb', () => {
  it('converts camelCase to snake_case and JSONB sub-entities', () => {
    const row = mapWorkRequestToDb(makeDomain());
    expect(row.id).toBe('r1');
    expect(row.farm_id).toBe('f1');
    expect(row.request_number).toBe('WR-2026-AB12CD');
    expect(row.customer_name).toBe('Jane Farmer');
    expect(row.work_type).toBe('spraying');
    expect(row.crop_year).toBe(2026);
    expect(row.products[0]).toEqual({
      product_name: 'Roundup',
      application_rate: '32',
      rate_unit: 'oz/ac',
      carrier_volume: null,
      carrier_volume_unit: null,
      application_method: null,
      supplier: 'farmer',
    });
    expect(row.fields[0].field_id).toBe('fld1');
    expect(row.fields[0].nearby_road).toBe('CR 5');
    expect(row.fields[0].road_source).toBe('nominatim');
    expect(row.fields[0].overrides?.crop).toBe('Soybeans');
  });

  it('converts epoch-ms timestamp to ISO string', () => {
    const row = mapWorkRequestToDb(makeDomain());
    expect(row.timestamp).toBe(new Date(1_789_000_000_000).toISOString());
  });

  it('sends undefined optionals as null', () => {
    const minimal = makeDomain({ customerPhone: undefined, providerName: undefined, notes: undefined });
    const row = mapWorkRequestToDb(minimal);
    expect(row.customer_phone).toBeNull();
    expect(row.provider_name).toBeNull();
    expect(row.notes).toBeNull();
  });

  it('throws on missing required fields', () => {
    expect(() => mapWorkRequestToDb({ ...makeDomain(), id: '' } as WorkRequest)).toThrow();
    expect(() => mapWorkRequestToDb({ ...makeDomain(), farm_id: '' } as WorkRequest)).toThrow();
    expect(() => mapWorkRequestToDb({ ...makeDomain(), requestNumber: '' } as WorkRequest)).toThrow();
  });
});

describe('mapWorkRequestFromDb', () => {
  function makeRow(overrides: Partial<WorkRequestRowType> = {}): WorkRequestRowType {
    return {
      id: 'r1',
      farm_id: 'f1',
      request_number: 'WR-2026-AB12CD',
      status: 'Sent',
      created_at: '2026-07-22T12:00:00.000Z',
      updated_at: '2026-07-22T13:00:00.000Z',
      customer_name: 'Jane Farmer',
      customer_phone: '555-1234',
      customer_billing_address: '100 Farm Ln',
      provider_name: 'Acme',
      provider_email: 'a@b.com',
      work_type: 'fertilizer',
      requested_completion_date: '2026-08-01',
      crop: 'Corn',
      crop_year: 2026,
      notes: 'Note',
      products: [{ product_name: 'Urea', application_rate: '100', rate_unit: 'lb/ac', carrier_volume: null, carrier_volume_unit: null, application_method: null, supplier: null }],
      fields: [{ field_id: 'fld1', farm_name: 'Home Farm', field_name: 'North 40', acreage: 40, crop: null, gps_lat: 38.5, gps_lng: -93.2, navigation_lat: 38.5, navigation_lng: -93.2, nearby_road: 'CR 5', road_source: 'manual', overrides: null }],
      timestamp: '2026-07-22T12:00:00.000Z',
      deleted_at: null,
      ...overrides,
    };
  }

  it('converts snake_case to camelCase and parses JSONB sub-entities', () => {
    const domain = mapWorkRequestFromDb(makeRow());
    expect(domain.id).toBe('r1');
    expect(domain.requestNumber).toBe('WR-2026-AB12CD');
    expect(domain.status).toBe('Sent');
    expect(domain.workType).toBe('fertilizer');
    expect(domain.products[0].productName).toBe('Urea');
    expect(domain.products[0].applicationRate).toBe('100');
    expect(domain.fields[0].fieldId).toBe('fld1');
    expect(domain.fields[0].nearbyRoad).toBe('CR 5');
    expect(domain.fields[0].roadSource).toBe('manual');
  });

  it('converts ISO timestamp string to epoch ms', () => {
    const domain = mapWorkRequestFromDb(makeRow());
    expect(domain.timestamp).toBe(new Date('2026-07-22T12:00:00.000Z').getTime());
  });

  it('maps null optionals to undefined', () => {
    const domain = mapWorkRequestFromDb(makeRow({ customer_phone: null, provider_name: null, notes: null }));
    expect(domain.customerPhone).toBeUndefined();
    expect(domain.providerName).toBeUndefined();
    expect(domain.notes).toBeUndefined();
  });

  it('round-trips through ToDb → FromDb', () => {
    const original = makeDomain();
    const row = mapWorkRequestToDb(original);
    const restored = mapWorkRequestFromDb(row as WorkRequestRowType);
    expect(restored.id).toBe(original.id);
    expect(restored.requestNumber).toBe(original.requestNumber);
    expect(restored.customerName).toBe(original.customerName);
    expect(restored.workType).toBe(original.workType);
    expect(restored.products[0].productName).toBe(original.products[0].productName);
    expect(restored.fields[0].fieldId).toBe(original.fields[0].fieldId);
    expect(restored.fields[0].nearbyRoad).toBe(original.fields[0].nearbyRoad);
  });
});
