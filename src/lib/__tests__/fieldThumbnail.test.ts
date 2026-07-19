import { describe, it, expect } from 'vitest';

import { geometryToThumbnailPath, getFieldThumbnailGeometry } from '../fieldThumbnail';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';

const makeField = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1',
  name: 'Test Field',
  acreage: 10,
  lat: null,
  lng: null,
  boundary: null,
  deleted_at: null,
  ...overrides,
  farm_id: overrides.farm_id ?? 'farm-1',
});

const makeAssignment = (overrides: Partial<FieldCluAssignment> = {}): FieldCluAssignment => ({
  id: 'assignment-1',
  farmId: 'farm-1',
  fieldId: 'field-1',
  tractKey: '6418-9423',
  cluNumber: '7',
  acres: 10,
  landUse: 'cropland',
  assignedAt: '',
  deletedAt: null,
  ...overrides,
});

const cluPolygon = [[[0, 0], [1, 0], [1, 1], [0, 0]]];

const makeTract = (): FsaTractImport => ({
  id: 'tract-1',
  farmId: 'farm-1',
  tractKey: '6418-9423',
  filename: '6418-9423.geojson',
  featureCount: 1,
  importedAt: '',
  deletedAt: null,
  geojson: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: cluPolygon },
      properties: { cluNumber: '7', acres: 10 },
    }],
  },
});

describe('geometryToThumbnailPath', () => {
  it('returns null for undefined geometry', () => {
    expect(geometryToThumbnailPath(undefined)).toBeNull();
  });

  it('returns null for null geometry', () => {
    expect(geometryToThumbnailPath(null)).toBeNull();
  });

  it('returns null for empty coordinates', () => {
    const empty: GeoJSONGeometry = { type: 'Polygon', coordinates: [] };
    expect(geometryToThumbnailPath(empty)).toBeNull();
  });

  it('returns null for a Polygon with fewer than 3 points', () => {
    const tiny: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 1]]],
    };
    expect(geometryToThumbnailPath(tiny)).toBeNull();
  });

  it('returns null for a degenerate bbox (all points identical)', () => {
    const degenerate: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [[[5, 5], [5, 5], [5, 5], [5, 5]]],
    };
    expect(geometryToThumbnailPath(degenerate)).toBeNull();
  });

  it('returns a path string for a valid Polygon', () => {
    const square: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
    };
    const path = geometryToThumbnailPath(square);
    expect(path).toBeTruthy();
    expect(path!.startsWith('M ')).toBe(true);
    expect(path!.includes(' Z')).toBe(true);
  });

  it('returns a path string for a valid MultiPolygon', () => {
    const multi: GeoJSONGeometry = {
      type: 'MultiPolygon',
      coordinates: [
        [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
        [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
      ],
    };
    const path = geometryToThumbnailPath(multi);
    expect(path).toBeTruthy();
    expect(path!.match(/Z/g)?.length).toBe(2);
  });

  it('keeps the path inside the 44x44 viewBox bounds', () => {
    const square: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
    };
    const path = geometryToThumbnailPath(square);
    expect(path).toBeTruthy();
    const numbers = path!.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(maxX).toBeLessThanOrEqual(44);
    expect(minY).toBeGreaterThanOrEqual(0);
    expect(maxY).toBeLessThanOrEqual(44);
  });

  it('preserves aspect ratio by using a uniform scale', () => {
    const wide: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 1], [0, 1], [0, 0]]],
    };
    const path = geometryToThumbnailPath(wide);
    expect(path).toBeTruthy();
    const numbers = path!.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width / height).toBeCloseTo(10, 0);
  });
});

describe('getFieldThumbnailGeometry', () => {
  it('uses a saved field boundary before CLU geometry', () => {
    const boundary: GeoJSONGeometry = {
      type: 'Polygon',
      coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]],
    };

    expect(getFieldThumbnailGeometry(makeField({ boundary }), [makeAssignment()], [makeTract()])).toBe(boundary);
  });

  it('builds thumbnail geometry from active CLU assignments and imported tracts', () => {
    const geometry = getFieldThumbnailGeometry(makeField(), [makeAssignment()], [makeTract()]);

    expect(geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [cluPolygon],
    });
  });

  it('falls back to legacy field CLU numbers when persisted assignments are not present', () => {
    const field = makeField({
      fsaFarmNumber: '6418',
      fsaTractNumber: '9423',
      cluNumbers: ['7'],
    });

    const geometry = getFieldThumbnailGeometry(field, [], [makeTract()]);
    expect(geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [cluPolygon],
    });
  });

  it('ignores deleted CLU assignments', () => {
    const geometry = getFieldThumbnailGeometry(
      makeField(),
      [makeAssignment({ deletedAt: new Date().toISOString() })],
      [makeTract()],
    );

    expect(geometry).toBeNull();
  });
});
