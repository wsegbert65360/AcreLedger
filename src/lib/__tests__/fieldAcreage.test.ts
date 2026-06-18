import { describe, expect, it } from 'vitest';

import { buildDisplayFieldAcreMap, calculateFieldCroplandAcres, getDisplayFieldAcres } from '../fieldAcreage';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';

const field: Field = {
  id: 'field-1',
  name: 'Bottom Field',
  acreage: 40,
  lat: 39,
  lng: -94,
  deleted_at: null,
};

const assignments: FieldCluAssignment[] = [
  {
    id: 'cropland-1',
    farmId: 'farm-1',
    fieldId: 'field-1',
    tractKey: '918-1327',
    cluNumber: '1',
    acres: 32,
    landUse: 'cropland',
    assignedAt: '2026-06-16T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 'non-cropland-1',
    farmId: 'farm-1',
    fieldId: 'field-1',
    tractKey: '918-1327',
    cluNumber: '2',
    acres: 8,
    landUse: 'non_cropland',
    assignedAt: '2026-06-16T00:00:00.000Z',
    deletedAt: null,
  },
];

describe('field acreage display helpers', () => {
  it('uses active cropland CLU acres instead of full field acreage', () => {
    expect(calculateFieldCroplandAcres('field-1', assignments)).toBe(32);
    expect(getDisplayFieldAcres(field, assignments)).toBe(32);
  });

  it('falls back to stored field acreage when no CLUs are assigned', () => {
    expect(calculateFieldCroplandAcres('field-1', [])).toBeNull();
    expect(getDisplayFieldAcres(field, [])).toBe(40);
  });

  it('builds display acreage maps by field', () => {
    const map = buildDisplayFieldAcreMap([field], assignments);

    expect(map.get('field-1')).toBe(32);
  });
});
