/**
 * Shared rain utility functions.
 *
 * All rain-related helpers live here to avoid duplication across
 * FieldCard, FieldDetailScreen, and RainService.
 *
 * CRITICAL: Vite inlines env vars at build time. If VITE_RAIN_API_URL
 * contains stray whitespace characters (\r, \n) — which can happen when
 * pasting values in Vercel/CI dashboards — every request will go to a
 * broken URL. Always sanitize via `getRainApiBaseUrl()`.
 */

import type { Field } from '@/types/farm';

// ── URL Helpers ──────────────────────────────────────────────────────────

/**
 * Read and sanitize the Rain API base URL from environment variables.
 * Strips trailing slashes and any stray carriage returns/newlines that
 * commonly appear when env vars are set in Vercel or CI dashboards.
 *
 * Returns `undefined` if the variable is not configured.
 */
export function getRainApiBaseUrl(): string | undefined {
  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RAIN_API_URL) ||
    (typeof process !== 'undefined' ? process.env?.VITE_RAIN_API_URL : undefined);

  if (!raw) return undefined;
  return raw.replace(/\/+$/, '').replace(/[\r\n]/g, '');
}

// ── Coordinate Helpers ───────────────────────────────────────────────────

/**
 * Compute a centroid [lat, lng] from a GeoJSON Polygon boundary.
 * Returns null if boundary is missing or has no coordinates.
 */
export function centroidFromBoundary(
  boundary: Field['boundary'],
): [number, number] | null {
  if (!boundary?.coordinates?.[0]?.length) return null;
  const ring = boundary.coordinates[0];
  let lat = 0;
  let lng = 0;
  for (const c of ring) {
    lat += c[1];
    lng += c[0];
  }
  return [lat / ring.length, lng / ring.length];
}

/**
 * Resolve the best [lat, lng] for a field.
 * Uses direct lat/lng if available; otherwise computes centroid from
 * the polygon boundary. Returns null when neither is available.
 */
export function resolveCoords(field: Field): [number, number] | null {
  if (field.lat != null && field.lng != null) {
    return [field.lat, field.lng];
  }
  return centroidFromBoundary(field.boundary);
}

// ── Breakdown Aggregation ────────────────────────────────────────────────

/**
 * Sum rainfall for the last N days from a { "YYYY-MM-DD": inches } breakdown.
 */
export function sumLastNDays(
  breakdown: Record<string, number>,
  n: number,
): number {
  const dates = Object.keys(breakdown).sort();
  if (dates.length === 0) return 0;
  return dates
    .slice(-n)
    .reduce((sum, d) => sum + (Number(breakdown[d]) || 0), 0);
}
