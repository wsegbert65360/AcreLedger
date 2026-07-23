import { getCentroid, hasValidGeometry, type GeoJSONGeometry } from '@/lib/geoHelpers';
import type { Field } from '@/types/farm';

export interface GpsPoint {
  lat: number;
  lng: number;
}

/**
 * Resolve a default navigation GPS point for a field.
 *
 * Preference order (matches the spec: "field entrance when one is stored, or
 * the nearest practical point along the field boundary; do not place the
 * navigation point in the middle of a field unless no better location is
 * available"):
 *
 * 1. Nearest boundary vertex to `roadPoint` (the resolved road location), when a
 *    boundary and road point both exist.
 * 2. Field coordinates (`field.lat`/`field.lng`) — the saved access point.
 * 3. Boundary centroid (last resort — "middle of the field").
 *
 * Field entrances are not yet modeled on `Field`, so nearest-boundary-vertex is
 * the closest practical stand-in.
 */
export function resolveDefaultNavPoint(
  field: Pick<Field, 'lat' | 'lng' | 'boundary'>,
  boundary: GeoJSONGeometry | null | undefined,
  roadPoint?: GpsPoint | null,
): GpsPoint | null {
  // 1. Nearest boundary vertex to the road point.
  if (roadPoint && hasValidGeometry(boundary ?? undefined)) {
    const nearest = nearestBoundaryVertex(boundary!, roadPoint);
    if (nearest) return nearest;
  }

  // 2. Stored field coordinates (the saved access point).
  if (field.lat != null && field.lng != null) {
    return { lat: field.lat, lng: field.lng };
  }

  // 3. Boundary centroid (last resort).
  if (hasValidGeometry(boundary ?? undefined) && boundary) {
    const [lat, lng] = getCentroid([{ geometry: boundary }]);
    return { lat, lng };
  }

  return null;
}

/** Return the boundary vertex closest (by haversine-ish squared distance) to `target`. */
export function nearestBoundaryVertex(geometry: GeoJSONGeometry, target: GpsPoint): GpsPoint | null {
  const points: GpsPoint[] = [];
  const polygons: number[][][][] =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        points.push({ lat, lng });
      }
    }
  }

  if (points.length === 0) return null;

  let best = points[0];
  let bestDist = squaredDistance(target, best);
  for (let i = 1; i < points.length; i += 1) {
    const dist = squaredDistance(target, points[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = points[i];
    }
  }
  return best;
}

/** Squared planar distance in degree-space — sufficient for relative comparison. */
function squaredDistance(a: GpsPoint, b: GpsPoint): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}
