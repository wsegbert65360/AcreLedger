import area from '@turf/area';
import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import intersect from '@turf/intersect';
import kinks from '@turf/kinks';
import unkinkPolygon from '@turf/unkink-polygon';
import union from '@turf/union';
import { featureCollection, multiPolygon, point, polygon } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import type { GeoJSONGeometry } from '@/lib/geoHelpers';
import type { CountyBoundary, CountyBounds } from './types';

export const SQUARE_METERS_PER_ACRE = 4046.8564224;

export type AreaGeometry = Polygon | MultiPolygon;

export interface NormalizedGeometry {
  geometry: AreaGeometry;
  /** Human-readable notes about repairs made (dropped rings, repaired self-intersections). */
  warnings: string[];
}

export type NormalizeResult =
  | { ok: true; value: NormalizedGeometry }
  | { ok: false; reason: string };

type Ring = number[][];

function isFiniteCoord(c: unknown): c is number[] {
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

function ringAreaSigned(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return sum / 2;
}

/** Cleans one ring: finite 2D coords, no consecutive duplicates, closed, at least 4 positions, non-zero area. */
function cleanRing(raw: unknown): Ring | null {
  if (!Array.isArray(raw)) return null;
  const ring: Ring = [];
  for (const c of raw) {
    if (!isFiniteCoord(c)) continue;
    const next = [c[0], c[1]];
    const prev = ring[ring.length - 1];
    if (prev && prev[0] === next[0] && prev[1] === next[1]) continue;
    ring.push(next);
  }
  if (ring.length >= 2) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  }
  if (ring.length < 4) return null;
  if (ring.some(c => c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90)) return null;
  if (Math.abs(ringAreaSigned(ring)) === 0) return null;
  return ring;
}

function cleanPolygon(raw: unknown, warnings: string[]): Ring[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const outer = cleanRing(raw[0]);
  if (!outer) return null;
  const rings: Ring[] = [outer];
  for (let i = 1; i < raw.length; i++) {
    const hole = cleanRing(raw[i]);
    if (hole) rings.push(hole);
    else warnings.push('Dropped an unusable interior ring');
  }
  return rings;
}

function extractRawGeometry(input: unknown): { type?: unknown; coordinates?: unknown } | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (obj.type === 'Feature') return extractRawGeometry(obj.geometry);
  return obj as { type?: unknown; coordinates?: unknown };
}

function repairSelfIntersections(geometry: AreaGeometry, warnings: string[]): AreaGeometry | null {
  const feature: Feature<AreaGeometry> = { type: 'Feature', properties: {}, geometry };
  let hasKinks = false;
  try {
    hasKinks = kinks(feature).features.length > 0;
  } catch {
    return null;
  }
  if (!hasKinks) return geometry;

  try {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const parts: Feature<Polygon>[] = [];
    for (const coords of polygons) {
      const poly = polygon(coords);
      if (kinks(poly).features.length === 0) {
        parts.push(poly);
        continue;
      }
      for (const piece of unkinkPolygon(poly).features) parts.push(piece as Feature<Polygon>);
    }
    if (parts.length === 0) return null;
    const merged = parts.length === 1
      ? parts[0]
      : union(featureCollection(parts));
    if (!merged) return null;
    warnings.push('Repaired a self-intersecting boundary');
    return merged.geometry as AreaGeometry;
  } catch {
    return null;
  }
}

/**
 * Turns whatever was imported or drawn into a valid Polygon/MultiPolygon, or says why it cannot.
 * Never guesses: a boundary that cannot be made usable is reported as unusable.
 */
export function normalizeGeometry(input: unknown, options: { repair?: boolean } = {}): NormalizeResult {
  const raw = extractRawGeometry(input);
  if (!raw) return { ok: false, reason: 'No geometry' };
  const warnings: string[] = [];

  let geometry: AreaGeometry | null = null;
  if (raw.type === 'Polygon') {
    const rings = cleanPolygon(raw.coordinates, warnings);
    if (rings) geometry = { type: 'Polygon', coordinates: rings };
  } else if (raw.type === 'MultiPolygon') {
    if (!Array.isArray(raw.coordinates)) return { ok: false, reason: 'No geometry' };
    const polys: Ring[][] = [];
    for (const p of raw.coordinates) {
      const rings = cleanPolygon(p, warnings);
      if (rings) polys.push(rings);
      else warnings.push('Dropped an unusable polygon part');
    }
    if (polys.length === 1) geometry = { type: 'Polygon', coordinates: polys[0] };
    else if (polys.length > 1) geometry = { type: 'MultiPolygon', coordinates: polys };
  } else {
    return { ok: false, reason: raw.type ? `Unsupported geometry type ${String(raw.type)}` : 'No geometry' };
  }

  if (!geometry) return { ok: false, reason: 'Geometry has no usable polygon' };

  // County boundaries come from a curated dataset; the self-intersection scan is quadratic and
  // only worth running on farm-drawn or imported subject geometry.
  const repaired = options.repair === false ? geometry : repairSelfIntersections(geometry, warnings);
  if (!repaired) return { ok: false, reason: 'Invalid geometry that could not be repaired' };
  if (!(geometryAreaSquareMeters(repaired) > 0)) return { ok: false, reason: 'Geometry has no area' };
  return { ok: true, value: { geometry: repaired, warnings } };
}

/** Geodesic (spherical) area; never computed from degrees. Holes are subtracted. */
export function geometryAreaSquareMeters(geometry: AreaGeometry): number {
  const value = area({ type: 'Feature', properties: {}, geometry });
  return Number.isFinite(value) ? value : 0;
}

export function squareMetersToAcres(squareMeters: number): number {
  return squareMeters / SQUARE_METERS_PER_ACRE;
}

export function geometryAcres(geometry: AreaGeometry): number {
  return squareMetersToAcres(geometryAreaSquareMeters(geometry));
}

export function geometryBounds(geometry: AreaGeometry): CountyBounds {
  const [minLng, minLat, maxLng, maxLat] = bbox({ type: 'Feature', properties: {}, geometry });
  return { minLng, minLat, maxLng, maxLat };
}

export function boundsOverlap(a: CountyBounds, b: CountyBounds): boolean {
  return a.minLng <= b.maxLng && a.maxLng >= b.minLng && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

export function boundsContain(outer: CountyBounds, inner: CountyBounds): boolean {
  return outer.minLng <= inner.minLng && outer.maxLng >= inner.maxLng
    && outer.minLat <= inner.minLat && outer.maxLat >= inner.maxLat;
}

export function unionBounds(items: CountyBounds[]): CountyBounds | null {
  if (items.length === 0) return null;
  return items.reduce((acc, b) => ({
    minLng: Math.min(acc.minLng, b.minLng),
    minLat: Math.min(acc.minLat, b.minLat),
    maxLng: Math.max(acc.maxLng, b.maxLng),
    maxLat: Math.max(acc.maxLat, b.maxLat),
  }));
}

export function padBounds(bounds: CountyBounds, degrees: number): CountyBounds {
  return {
    minLng: bounds.minLng - degrees,
    minLat: bounds.minLat - degrees,
    maxLng: bounds.maxLng + degrees,
    maxLat: bounds.maxLat + degrees,
  };
}

export interface CountyOverlap {
  county: CountyBoundary;
  acres: number;
}

export interface PreparedCounty {
  county: CountyBoundary;
  geometry: AreaGeometry;
  bounds: CountyBounds;
}

const preparedCache = new WeakMap<CountyBoundary, PreparedCounty | null>();

/** Normalizes a county once (cached per object) so many subjects can be tested against it cheaply. */
export function prepareCounty(county: CountyBoundary): PreparedCounty | null {
  const cached = preparedCache.get(county);
  if (cached !== undefined) return cached;
  const normalized = normalizeGeometry(county.geometry, { repair: false });
  const prepared = normalized.ok
    ? { county, geometry: normalized.value.geometry, bounds: geometryBounds(normalized.value.geometry) }
    : null;
  preparedCache.set(county, prepared);
  return prepared;
}

/** Area of `subject` inside each county it overlaps. Counties whose boxes miss the subject are skipped. */
export function intersectWithCounties(subject: AreaGeometry, counties: CountyBoundary[]): CountyOverlap[] {
  const subjectBounds = geometryBounds(subject);
  const subjectFeature = { type: 'Feature' as const, properties: {}, geometry: subject };
  const overlaps: CountyOverlap[] = [];
  for (const county of counties) {
    const prepared = prepareCounty(county);
    if (!prepared || !boundsOverlap(subjectBounds, prepared.bounds)) continue;
    let overlap: Feature<AreaGeometry> | null = null;
    try {
      overlap = intersect(featureCollection([
        subjectFeature,
        { type: 'Feature' as const, properties: {}, geometry: prepared.geometry },
      ])) as Feature<AreaGeometry> | null;
    } catch {
      overlap = null;
    }
    if (!overlap) continue;
    const acres = geometryAcres(overlap.geometry);
    if (acres > 0) overlaps.push({ county, acres });
  }
  return overlaps;
}

/** Counties containing a point. A point on a shared edge can sit in two counties; callers must treat that as ambiguous. */
export function countiesContainingPoint(lat: number, lng: number, counties: CountyBoundary[]): CountyBoundary[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const pt = point([lng, lat]);
  const hits: CountyBoundary[] = [];
  for (const county of counties) {
    const prepared = prepareCounty(county);
    if (!prepared) continue;
    const g = prepared.geometry;
    const feature = g.type === 'Polygon' ? polygon(g.coordinates) : multiPolygon(g.coordinates);
    if (booleanPointInPolygon(pt, feature as Parameters<typeof booleanPointInPolygon>[1])) hits.push(county);
  }
  return hits;
}

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Stable change-detection hash of a geometry (about 1 cm precision). Not a security hash.
 * Equal for the same shape however the JSON was formatted.
 */
export function hashGeometry(geometry: GeoJSONGeometry | AreaGeometry): string {
  const round = (n: number) => Math.round(n * 1e7) / 1e7;
  const text = JSON.stringify(geometry.coordinates, (_key, value) => (typeof value === 'number' ? round(value) : value));
  const a = fnv1a(text, 0x811c9dc5);
  const b = fnv1a(text, 0x9e3779b1);
  return `g1:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}:${text.length.toString(16)}`;
}

/** Hash of a bare point, for subjects that only have a location. */
export function hashPoint(lat: number, lng: number): string {
  return `p1:${lat.toFixed(6)},${lng.toFixed(6)}`;
}
