import { describe, it, expect } from 'vitest';
import { resolveDefaultNavPoint, nearestBoundaryVertex } from './navPoint';
import type { Field } from '@/types/farm';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';

// A square-ish boundary near a known centroid.
const SQUARE_BOUNDARY: GeoJSONGeometry = {
  type: 'Polygon',
  coordinates: [[
    [-93.0, 38.0],
    [-92.9, 38.0],
    [-92.9, 38.1],
    [-93.0, 38.1],
    [-93.0, 38.0],
  ]],
};

describe('nearestBoundaryVertex', () => {
  it('returns the vertex closest to the target', () => {
    const target = { lat: 38.0, lng: -92.9 }; // near the eastern edge
    const nearest = nearestBoundaryVertex(SQUARE_BOUNDARY, target);
    expect(nearest).toEqual({ lat: 38.0, lng: -92.9 });
  });

  it('returns null for empty geometry', () => {
    const empty: GeoJSONGeometry = { type: 'Polygon', coordinates: [] };
    expect(nearestBoundaryVertex(empty, { lat: 0, lng: 0 })).toBeNull();
  });
});

describe('resolveDefaultNavPoint', () => {
  const fieldNoCoords: Pick<Field, 'lat' | 'lng' | 'boundary'> = { lat: null, lng: null, boundary: SQUARE_BOUNDARY };

  it('prefers nearest boundary vertex to the road point', () => {
    const roadPoint = { lat: 38.0, lng: -92.85 }; // east of the field
    const point = resolveDefaultNavPoint(fieldNoCoords, SQUARE_BOUNDARY, roadPoint);
    expect(point).toEqual({ lat: 38.0, lng: -92.9 }); // eastern edge vertex
  });

  it('falls back to field coordinates when no road point', () => {
    const fieldWithCoords: Pick<Field, 'lat' | 'lng' | 'boundary'> = { lat: 38.05, lng: -92.95, boundary: SQUARE_BOUNDARY };
    const point = resolveDefaultNavPoint(fieldWithCoords, SQUARE_BOUNDARY, null);
    expect(point).toEqual({ lat: 38.05, lng: -92.95 });
  });

  it('falls back to boundary centroid as last resort', () => {
    const point = resolveDefaultNavPoint(fieldNoCoords, SQUARE_BOUNDARY, null);
    expect(point).not.toBeNull();
    // Centroid of the square is roughly (38.04, -92.96) via naive average.
    expect(point!.lat).toBeCloseTo(38.04, 1);
    expect(point!.lng).toBeCloseTo(-92.96, 1);
  });

  it('returns null when no road point, no field coords, and no boundary', () => {
    const emptyField: Pick<Field, 'lat' | 'lng' | 'boundary'> = { lat: null, lng: null, boundary: null };
    expect(resolveDefaultNavPoint(emptyField, null, null)).toBeNull();
  });
});
