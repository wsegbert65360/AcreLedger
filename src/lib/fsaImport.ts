import { calculateAcreage } from '@/lib/gisService';
import { Field } from '@/types/farm';

type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

type GeoJsonMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

type GeoJsonFeature = {
  type: 'Feature';
  geometry?: GeoJsonGeometry | { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features?: GeoJsonFeature[];
};

export type FsaImportCandidate = {
  id: string;
  name: string;
  acreage: number;
  lat: number | null;
  lng: number | null;
  boundary: Field['boundary'];
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  fsaFieldNumber?: string;
  intendedUse?: string;
  notes?: string;
  sourceProperties: Record<string, unknown>;
};

function readString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function readNumber(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const numeric = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseFarmNumberFromFilename(filename: string): string {
  return filename.match(/\bFSN\s*([A-Za-z0-9-]+)/i)?.[1] ?? '';
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function normalizeRing(ring: unknown): number[][] | null {
  if (!Array.isArray(ring)) return null;

  const positions = ring
    .filter(isPosition)
    .map(position => [Number(position[0]), Number(position[1])]);

  if (positions.length < 3) return null;

  const first = positions[0];
  const last = positions[positions.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1]
    ? positions
    : [...positions, first];

  return closed.length >= 4 ? closed : null;
}

function normalizeGeometry(geometry: GeoJsonFeature['geometry']): Field['boundary'] {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates
      .map(normalizeRing)
      .filter((ring): ring is number[][] => !!ring);

    return rings.length > 0 ? { type: 'Polygon', coordinates: rings } : null;
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates
      .map(polygon => polygon
        .map(normalizeRing)
        .filter((ring): ring is number[][] => !!ring))
      .filter(polygon => polygon.length > 0);

    return polygons.length > 0 ? { type: 'MultiPolygon', coordinates: polygons } : null;
  }

  return null;
}

function centroidFromBoundary(boundary: Field['boundary']): { lat: number | null; lng: number | null } {
  if (!boundary) return { lat: null, lng: null };
  const outerRings = boundary.type === 'Polygon'
    ? [boundary.coordinates[0]]
    : boundary.coordinates.map(polygon => polygon[0]);
  const points = outerRings.flatMap(ring => {
    if (!ring) return [];
    const unclosedRing = ring.slice(0, -1);
    return unclosedRing.length > 0 ? unclosedRing : ring;
  });

  if (points.length === 0) {
    return { lat: null, lng: null };
  }

  const totals = points.reduce(
    (acc, point) => ({ lng: acc.lng + point[0], lat: acc.lat + point[1] }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: Number((totals.lat / points.length).toFixed(6)),
    lng: Number((totals.lng / points.length).toFixed(6)),
  };
}

function buildNotes(properties: Record<string, unknown>): string {
  const noteParts = [
    ['County', readString(properties.county)],
    ['State', readString(properties.state)],
    ['HEL', readString(properties.hel)],
    ['Status', readString(properties.plu_status || properties.status)],
    ['PLU ID', readString(properties.plu_id)],
    ['Case', readString(properties.case_name)],
    ['Last changed', readString(properties.last_chang)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);

  return noteParts.join('\n');
}

function candidateFromFeature(feature: GeoJsonFeature, filename: string, index: number): FsaImportCandidate | null {
  const boundary = normalizeGeometry(feature.geometry);
  if (!boundary) return null;

  const properties = feature.properties ?? {};
  const farmNumber = parseFarmNumberFromFilename(filename);
  const tractNumber = readString(properties.tract);
  const fieldNumber = readString(properties.plu_number);
  const landUse = readString(properties.land_use);
  const pluName = readString(properties.plu_name);
  const calculatedAcres = readNumber(properties.calc_acres);
  const programAcres = readNumber(properties.prog_acres);
  const acreage = programAcres ?? calculatedAcres ?? calculateAcreage(boundary);
  const centroid = centroidFromBoundary(boundary);

  return {
    id: readString(properties.plu_id) || `${tractNumber}-${fieldNumber}-${index}`,
    name: pluName || `Tract ${tractNumber || '?'} Field ${fieldNumber || index + 1}`,
    acreage,
    lat: centroid.lat,
    lng: centroid.lng,
    boundary,
    fsaFarmNumber: farmNumber || undefined,
    fsaTractNumber: tractNumber || undefined,
    fsaFieldNumber: fieldNumber || undefined,
    intendedUse: landUse || undefined,
    notes: buildNotes(properties) || undefined,
    sourceProperties: properties,
  };
}

export function parseFsaGeoJson(contents: string, filename = ''): FsaImportCandidate[] {
  let parsed: GeoJsonFeatureCollection | GeoJsonFeature;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const features = parsed.type === 'FeatureCollection'
    ? parsed.features ?? []
    : parsed.type === 'Feature'
      ? [parsed]
      : [];

  if (features.length === 0) {
    throw new Error('No GeoJSON features were found in this file.');
  }

  const candidates = features
    .map((feature, index) => candidateFromFeature(feature, filename, index))
    .filter((candidate): candidate is FsaImportCandidate => !!candidate);

  if (candidates.length === 0) {
    throw new Error('No supported polygon fields were found in this file.');
  }

  return candidates;
}
