import type { WorkRequestFieldEntry } from '@/types/farm';

/**
 * Required attribution for OpenStreetMap Nominatim usage.
 * Display this wherever auto-detected road names appear (review screen + PDF).
 * https://operations.osmfoundation.org/policies/nominatim-usage-policy
 */
export const NOMINATIM_ATTRIBUTION = 'Nearby road names © OpenStreetMap contributors';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
/** Nominatim policy requires max 1 request per second. */
const MIN_INTERVAL_MS = 1100;

let lastRequestTime = 0;

export interface RoadLookupResult {
  /** Nearest named road, or undefined if lookup failed / no road found. */
  name?: string;
  /** Approximate location of the resolved road feature (for nav-point snapping). */
  point?: { lat: number; lng: number };
}

interface NominatimReverseResponse {
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    cycleway?: string;
    residential?: string;
    neighbourhood?: string;
    hamlet?: string;
  };
  lat?: string;
  lon?: string;
  error?: string;
}

/**
 * Throttle helper — ensures at least MIN_INTERVAL_MS between calls. Exported for
 * testability (tests can await it to assert pacing).
 */
export async function enforceThrottle(now: number = Date.now()): Promise<void> {
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/** Reset throttle state — intended for tests. */
export function _resetThrottleForTests(): void {
  lastRequestTime = 0;
}

function pickRoadName(address: NominatimReverseResponse['address']): string | undefined {
  if (!address) return undefined;
  return address.road || address.pedestrian || address.footway || address.cycleway || address.residential || undefined;
}

/**
 * Reverse-geocode the nearest named road for a coordinate using Nominatim.
 *
 * Throttled to 1 req/sec (Nominatim policy), attributed, and fails gracefully
 * (returns undefined on any error or missing road) so callers fall back to
 * manual entry. Heavy production use should later be moved behind a Vercel
 * proxy like the weather proxy.
 */
export async function lookupNearbyRoad(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
): Promise<RoadLookupResult> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {};
  }

  await enforceThrottle();

  const url = `${NOMINATIM_ENDPOINT}?format=json&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return {};
    const data = (await response.json()) as NominatimReverseResponse;
    if (data.error) return {};

    const name = pickRoadName(data.address);
    const point = data.lat != null && data.lon != null
      ? { lat: Number(data.lat), lng: Number(data.lon) }
      : { lat, lng };

    return name ? { name, point } : { point };
  } catch {
    return {};
  }
}

/**
 * Sequence road lookups across multiple field entries, throttled.
 * Updates each entry's `nearbyRoad`/`roadSource`/nav point in place via the
 * provided updater (so callers can debounce React state writes).
 */
export async function lookupRoadsForFields(
  entries: WorkRequestFieldEntry[],
  options: {
    fetchImpl?: typeof fetch;
    onFieldResolved?: (index: number, result: RoadLookupResult) => void;
  } = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.gpsLat == null || entry.gpsLng == null) {
      options.onFieldResolved?.(i, {});
      continue;
    }
    const result = await lookupNearbyRoad(entry.gpsLat, entry.gpsLng, fetchImpl);
    options.onFieldResolved?.(i, result);
  }
}
