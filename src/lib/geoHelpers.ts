import L from 'leaflet';

export type GeoJSONGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export function getLatLngsFromGeometry(
  geometry: GeoJSONGeometry | undefined
): L.LatLngExpression[] | L.LatLngExpression[][] | L.LatLngExpression[][][] {
  if (!geometry || !geometry.coordinates) return [];
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring: number[][]) =>
      ring.map((c: number[]) => [c[1], c[0]] as [number, number])
    );
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((poly: number[][][]) =>
      poly.map((ring: number[][]) =>
        ring.map((c: number[]) => [c[1], c[0]] as [number, number])
      )
    );
  }
  return [];
}

export function hasValidGeometry(geometry: GeoJSONGeometry | undefined): boolean {
  if (!geometry || !geometry.coordinates) return false;
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    return !!(ring && ring.length >= 3);
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly: number[][][]) => {
      const ring = poly[0];
      return !!(ring && ring.length >= 3);
    });
  }
  return false;
}

export function getCentroid(features: { geometry: GeoJSONGeometry }[]): [number, number] {
  if (features.length === 0) return [38.47, -93.54];
  let sumLat = 0, sumLng = 0, n = 0;
  for (const f of features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Polygon') {
      const ring = f.geometry.coordinates[0];
      if (ring) {
        for (const c of ring) { sumLng += c[0]; sumLat += c[1]; n++; }
      }
    } else if (f.geometry.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        const ring = poly[0];
        if (ring) {
          for (const c of ring) { sumLng += c[0]; sumLat += c[1]; n++; }
        }
      }
    }
  }
  return n > 0 ? [sumLat / n, sumLng / n] : [38.47, -93.54];
}
