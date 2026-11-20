import { offlineStorage } from '@/lib/offlineStorage';
import { COUNTY_RPC_LIMIT, countyBoundaryService } from '@/services/countyBoundaryService';
import { boundsOverlap } from './geometry';
import type { CountyBoundary, CountyBounds } from './types';

/**
 * County boundaries are shared reference data, never fetched per report. They are fetched once
 * per area and kept on the device so assignment and reports work offline.
 *
 * Coverage is recorded per grid cell. A cell counts as covered only after a complete answer, so
 * "no county found" can never be mistaken for "not downloaded yet".
 */
const CACHE_TABLE = 'county_boundary_cache';
const CELL_DEGREES = 0.25;
const MAX_CACHED_COUNTIES = 16;

interface CacheShape {
  counties: CountyBoundary[];
  coveredCells: string[];
}

export interface BoundaryResult {
  counties: CountyBoundary[] | null;
  /** Why boundaries are unavailable, when counties is null. */
  reason: string | null;
}

const cellKey = (x: number, y: number) => `${x}:${y}`;

export function cellsFor(bounds: CountyBounds): { key: string; bounds: CountyBounds }[] {
  const cells: { key: string; bounds: CountyBounds }[] = [];
  const x0 = Math.floor(bounds.minLng / CELL_DEGREES);
  const x1 = Math.floor(bounds.maxLng / CELL_DEGREES);
  const y0 = Math.floor(bounds.minLat / CELL_DEGREES);
  const y1 = Math.floor(bounds.maxLat / CELL_DEGREES);
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      cells.push({
        key: cellKey(x, y),
        bounds: { minLng: x * CELL_DEGREES, minLat: y * CELL_DEGREES, maxLng: (x + 1) * CELL_DEGREES, maxLat: (y + 1) * CELL_DEGREES },
      });
    }
  }
  return cells;
}

function countyBounds(county: CountyBoundary): CountyBounds | null {
  let minLng = Infinity; let minLat = Infinity; let maxLng = -Infinity; let maxLat = -Infinity;
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      minLng = Math.min(minLng, value[0]); maxLng = Math.max(maxLng, value[0]);
      minLat = Math.min(minLat, value[1]); maxLat = Math.max(maxLat, value[1]);
      return;
    }
    value.forEach(walk);
  };
  walk((county.geometry as { coordinates?: unknown }).coordinates);
  return Number.isFinite(minLng) ? { minLng, minLat, maxLng, maxLat } : null;
}

async function readCache(userId: string | null): Promise<CacheShape> {
  const raw = await offlineStorage.loadCache(CACHE_TABLE, userId);
  const entry = raw?.[0] as Partial<CacheShape> | undefined;
  return { counties: entry?.counties ?? [], coveredCells: entry?.coveredCells ?? [] };
}

async function writeCache(userId: string | null, cache: CacheShape): Promise<void> {
  await offlineStorage.saveCache(CACHE_TABLE, userId, [cache]);
}

export interface BoundaryProviderOptions {
  userId: string | null;
  isOnline: boolean;
}

/**
 * Counties touching the given area. Returns counties: null (never an empty list) when the area is
 * not fully available, so callers defer instead of recording "unresolved".
 */
export async function loadCountiesFor(bounds: CountyBounds | null, options: BoundaryProviderOptions): Promise<BoundaryResult> {
  if (!bounds) return { counties: [], reason: null };
  const cache = await readCache(options.userId);
  const covered = new Set(cache.coveredCells);
  const missing = cellsFor(bounds).filter(c => !covered.has(c.key));

  if (missing.length > 0) {
    if (!options.isOnline) {
      return { counties: null, reason: 'County boundaries are not downloaded for this area yet; connect to download them.' };
    }
    const byKey = new Map(cache.counties.map(c => [`${c.datasetVersion}|${c.fips}`, c]));
    const newlyCovered: string[] = [];
    for (const cell of missing) {
      const { data, error } = await countyBoundaryService.fetchBoundaries(cell.bounds);
      if (error || !data) {
        return { counties: null, reason: 'County boundaries could not be downloaded. Try again when the connection is stable.' };
      }
      if (data.length >= COUNTY_RPC_LIMIT) {
        return { counties: null, reason: 'The county boundary download for this area was incomplete.' };
      }
      for (const county of data) byKey.set(`${county.datasetVersion}|${county.fips}`, county);
      newlyCovered.push(cell.key);
    }
    // A newer dataset replaces an older copy of the same county.
    const newest = new Map<string, CountyBoundary>();
    for (const county of byKey.values()) {
      const prior = newest.get(county.fips);
      if (!prior || county.datasetVersion > prior.datasetVersion) newest.set(county.fips, county);
    }
    cache.counties = [...newest.values()].slice(-MAX_CACHED_COUNTIES);
    cache.coveredCells = [...cache.coveredCells, ...newlyCovered];
    await writeCache(options.userId, cache);
  }

  const touching = cache.counties.filter(county => {
    const cb = countyBounds(county);
    return cb ? boundsOverlap(cb, bounds) : false;
  });
  return { counties: touching, reason: null };
}
