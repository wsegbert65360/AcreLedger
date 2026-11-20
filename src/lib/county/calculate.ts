import { roundTo } from '@/utils/numbers';
import {
  countiesContainingPoint,
  hashGeometry,
  hashPoint,
  geometryAcres,
  intersectWithCounties,
  normalizeGeometry,
} from './geometry';
import type { CountyBoundary } from './types';

/** Overlaps smaller than both limits are boundary-data slivers, not land in another county. */
export const SLIVER_MAX_ACRES = 0.05;
export const SLIVER_MAX_FRACTION = 0.005;
/** Below this share of the polygon covered by any county, the boundary data does not cover the land. */
export const MIN_COVERAGE = 0.5;
/** Between MIN_COVERAGE and this, the shares are used but the result is flagged for review. */
export const REVIEW_COVERAGE = 0.98;

export interface CalculatedCountyRow {
  county: CountyBoundary;
  mappedAcres: number;
  /** 0..1, shares of one subject sum to 1 (to 6 decimals). */
  proportion: number;
}

export type CountyCalculation =
  | {
    kind: 'resolved';
    method: 'geometry' | 'centroid';
    rows: CalculatedCountyRow[];
    geometryHash: string;
    /** Whole-polygon geodesic acres (0 for a point lookup). */
    totalAcres: number;
    /** Share of the polygon covered by county data, 0..1. */
    coverage: number;
    needsReview: boolean;
    reviewReason: string | null;
    warnings: string[];
  }
  | {
    kind: 'unresolved';
    reason: string;
    geometryHash: string | null;
    warnings: string[];
  }
  /** Boundary data was not available, so nothing is saved and the subject stays pending. */
  | { kind: 'deferred'; reason: string };

export interface CalculateCountyInput {
  geometry?: unknown;
  /** Location point. Used only when there is no polygon, and the result is provisional. */
  point?: { lat: number | null; lng: number | null } | null;
  /** Counties covering the subject. An empty list means boundary data is unavailable. */
  counties: CountyBoundary[];
}

function hasUsablePoint(p: CalculateCountyInput['point']): p is { lat: number; lng: number } {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number'
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && !(p.lat === 0 && p.lng === 0);
}

/** Distribute proportions that sum to 1 at 6 decimals using largest remainder. */
function roundProportions(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return weights.map(() => 0);
  const scale = 1_000_000;
  const exact = weights.map(w => (w / total) * scale);
  const floors = exact.map(Math.floor);
  let remaining = scale - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, rem: value - floors[index] }))
    .sort((a, b) => b.rem - a.rem || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    floors[index] += 1;
    remaining -= 1;
  }
  return floors.map(n => n / scale);
}

/**
 * Intersects a subject with county boundaries.
 *
 * A polygon always wins over a point. A point never establishes how an entire tract divides:
 * the point result is a single provisional county and is flagged for review.
 */
export function calculateCountyAssignment(input: CalculateCountyInput): CountyCalculation {
  const hasGeometryInput = input.geometry != null;

  if (hasGeometryInput) {
    const normalized = normalizeGeometry(input.geometry);
    if (!normalized.ok) {
      return { kind: 'unresolved', reason: normalized.reason, geometryHash: null, warnings: [] };
    }
    const { geometry, warnings } = normalized.value;
    const geometryHash = hashGeometry(geometry);
    if (input.counties.length === 0) {
      return { kind: 'deferred', reason: 'County boundary data is not available yet' };
    }

    const totalAcres = geometryAcres(geometry);
    const overlaps = intersectWithCounties(geometry, input.counties);
    const coveredAcres = overlaps.reduce((sum, o) => sum + o.acres, 0);
    const coverage = totalAcres > 0 ? Math.min(1, coveredAcres / totalAcres) : 0;

    if (overlaps.length === 0 || coverage < MIN_COVERAGE) {
      return {
        kind: 'unresolved',
        reason: overlaps.length === 0
          ? 'Boundary does not fall inside any county in the boundary data'
          : `Only ${Math.round(coverage * 100)}% of the boundary falls inside known counties`,
        geometryHash,
        warnings,
      };
    }

    // Drop slivers so a boundary that grazes a county line by a few feet is not reported as split.
    let kept = overlaps.filter(o =>
      !(o.acres < SLIVER_MAX_ACRES && o.acres / coveredAcres < SLIVER_MAX_FRACTION));
    if (kept.length === 0) kept = [overlaps.reduce((a, b) => (b.acres > a.acres ? b : a))];
    if (kept.length < overlaps.length) warnings.push('Ignored a sliver of overlap with a neighboring county');

    const keptAcres = kept.reduce((sum, o) => sum + o.acres, 0);
    const proportions = roundProportions(kept.map(o => o.acres));
    const rows = kept
      .map((o, i) => ({ county: o.county, mappedAcres: roundTo(o.acres, 4), proportion: proportions[i] }))
      .sort((a, b) => b.proportion - a.proportion || a.county.fips.localeCompare(b.county.fips));

    const gapAcres = totalAcres - keptAcres;
    const needsReview = coverage < REVIEW_COVERAGE;
    if (gapAcres > 0.005 && needsReview) {
      warnings.push(`${roundTo(gapAcres, 2)} ac of the boundary is outside the county data`);
    }
    return {
      kind: 'resolved',
      method: 'geometry',
      rows,
      geometryHash,
      totalAcres: roundTo(totalAcres, 4),
      coverage,
      needsReview,
      reviewReason: needsReview
        ? `Only ${Math.round(coverage * 100)}% of the boundary falls inside known counties`
        : null,
      warnings,
    };
  }

  if (hasUsablePoint(input.point)) {
    const { lat, lng } = input.point;
    const geometryHash = hashPoint(lat, lng);
    if (input.counties.length === 0) {
      return { kind: 'deferred', reason: 'County boundary data is not available yet' };
    }
    const hits = countiesContainingPoint(lat, lng, input.counties);
    if (hits.length === 0) {
      return { kind: 'unresolved', reason: 'Location is not inside any county in the boundary data', geometryHash, warnings: [] };
    }
    // A point exactly on a county line is ambiguous; pick deterministically but say so.
    const county = [...hits].sort((a, b) => a.fips.localeCompare(b.fips))[0];
    return {
      kind: 'resolved',
      method: 'centroid',
      rows: [{ county, mappedAcres: 0, proportion: 1 }],
      geometryHash,
      totalAcres: 0,
      coverage: 1,
      needsReview: true,
      reviewReason: hits.length > 1
        ? 'Location sits on a county line; confirm the county'
        : 'Provisional county from a single location point; add a boundary to measure the split',
      warnings: [],
    };
  }

  return { kind: 'unresolved', reason: 'No boundary or location to place this land', geometryHash: null, warnings: [] };
}
