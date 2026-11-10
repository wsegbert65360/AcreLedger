import { PREMIUM_REQUIRED_ERRCODE } from '@/lib/entitlements';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';
import { getCentroid, hasValidGeometry } from '@/lib/geoHelpers';
import { supabase } from '@/lib/supabase';

export type RainfallResult = {
  '24h': number;
  '72h': number;
  '168h': number;
  '7d': number; // Alias for 168h, always provided by the service
  sincePlanting: number | null;
  sinceLastSpray: number | null;
  periodEndUtc: string;
  dataWarning?: string;
};

/** High-res rainfall was requested without a field. The Rain API is not called. */
export class RainfallFieldRequiredError extends Error {
  readonly code = 'rainfall_field_required';
  constructor() {
    super('High-resolution rainfall requires a field.');
    this.name = 'RainfallFieldRequiredError';
  }
}

/**
 * Rain API 403 `premium_required:rainfall`.
 * Field detail treats this like the other premium-required errors and shows the Pro rainfall lock.
 */
export class PremiumRainfallRequiredError extends Error {
  readonly code = PREMIUM_REQUIRED_ERRCODE;
  constructor() {
    super('premium_required:rainfall');
    this.name = 'PremiumRainfallRequiredError';
  }
}

/** Rain API 401 or 503. Callers show this as a normal rainfall load failure. */
export class RainfallUnavailableError extends Error {
  readonly status: number;
  constructor(status: number) {
    super('Could not load rainfall data.');
    this.name = 'RainfallUnavailableError';
    this.status = status;
  }
}

// RAIN_API_AUTH=enforce requires the caller's Supabase access token on every request.
// No session, or any session error: send no Authorization header.
async function rainAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function rainfallErrorText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  return [record.error, record.message, record.code]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

async function rainfallHttpError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  const text = rainfallErrorText(body);
  if (response.status === 403 && text.includes('premium_required:rainfall')) {
    return new PremiumRainfallRequiredError();
  }
  if (response.status === 401 || response.status === 503) {
    return new RainfallUnavailableError(response.status);
  }
  return new Error(`RAIN_API_ERROR: ${response.status} - ${text || 'Unknown error'}`);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

const promiseCache = new Map<string, Promise<RainfallResult>>();
const DEFAULT_RAIN_API_URL = 'https://rain-api.vercel.app';

function resolveRainApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_RAIN_API_URL;

  if (configuredUrl === '') {
    throw new Error('VITE_RAIN_API_URL is not configured');
  }

  let baseUrl = (configuredUrl ?? DEFAULT_RAIN_API_URL).trim().replace(/^['"]|['"]$/g, '');

  if (!baseUrl) {
    throw new Error('VITE_RAIN_API_URL is not configured');
  }

  baseUrl = baseUrl.replace(/\/+$/, '');
  if (baseUrl.endsWith('/rain')) {
    baseUrl = baseUrl.slice(0, -5);
  }

  const parsedUrl = new URL(baseUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
    throw new Error('VITE_RAIN_API_URL must use HTTPS');
  }

  return baseUrl;
}

export const RainService = {
  async fetchComprehensiveRainfall(args: {
    fieldId?: string | null;
    lat?: number | null;
    lng?: number | null;
    boundary?: GeoJSONGeometry | null;
    sincePlantingDate?: string;
    sinceLastSprayDate?: string;
    signal?: AbortSignal;
  }): Promise<RainfallResult> {
    const { fieldId, lat, lng, boundary, sincePlantingDate, sinceLastSprayDate, signal } = args;

    throwIfAborted(signal);
    // Coordinate-only requests are refused once RAIN_API_AUTH=enforce. Never call the API without a field.
    const normalizedFieldId = typeof fieldId === 'string' ? fieldId.trim() : '';
    if (!normalizedFieldId) {
      throw new RainfallFieldRequiredError();
    }
    const cacheKey = `${normalizedFieldId}-${lat}-${lng}-${sincePlantingDate || ''}-${sinceLastSprayDate || ''}`;

    const existing = promiseCache.get(cacheKey);
    if (existing) {
      try { const result = await existing; throwIfAborted(signal); return result; } catch { throwIfAborted(signal); /* retry */ }
    }

    const fetchPromise = (async () => {
      const baseUrl = resolveRainApiBaseUrl();

      let tLat = lat != null ? Math.round(lat * 10000) / 10000 : null;
      let tLng = lng != null ? Math.round(lng * 10000) / 10000 : null;

      if ((tLat == null || tLng == null) && hasValidGeometry(boundary ?? undefined) && boundary) {
        // Use the shared centroid helper so a MultiPolygon boundary resolves to
        // the centroid of the *whole* field, not just its first polygon. The
        // helper returns [lat, lng] and iterates every polygon's outer ring.
        const [centroidLat, centroidLng] = getCentroid([{ geometry: boundary }]);
        if (!Number.isNaN(centroidLat) && !Number.isNaN(centroidLng)) {
          tLat = Math.round(centroidLat * 10000) / 10000;
          tLng = Math.round(centroidLng * 10000) / 10000;
        }
      }

      if (tLat == null || tLng == null) {
        throw new Error('Missing location data (lat/lng or boundary) for rainfall lookup.');
      }

      const mainParams = new URLSearchParams({
        lat: String(tLat),
        lon: String(tLng),
        field_id: normalizedFieldId,
      });
      const mainResponse = await fetch(
        `${baseUrl}/rain?${mainParams.toString()}`,
        { signal, headers: await rainAuthHeaders() }
      );

      if (!mainResponse.ok) {
        throw await rainfallHttpError(mainResponse);
      }

      const mainData = await mainResponse.json();
      const rain = mainData.rain ?? {};
      const periodEndUtc = mainData.periodEndUtc || new Date().toISOString();

      // --- Custom range via Rain API (field-based historical lookup) ---
      const fetchCustomRange = async (startDate: string): Promise<{ total: number | null; dataWarning?: string }> => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const rangeParams = new URLSearchParams({
            field_id: normalizedFieldId,
            lat: String(tLat),
            lon: String(tLng),
            start_date: startDate,
            end_date: today,
          });
          const response = await fetch(
            `${baseUrl}/rain?${rangeParams.toString()}`,
            { signal, headers: await rainAuthHeaders() }
          );
          if (!response.ok) throw new Error('Range lookup failed');
          const data = await response.json();
          const total = data.rain?.total;
          if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) throw new Error('Invalid rainfall total');
          return {
            total: Math.round(total * 1000) / 1000,
            dataWarning: data.dataWarning || undefined,
          };
        } catch (error) {
          throwIfAborted(signal);
          if ((error as { name?: string })?.name === 'AbortError') throw error;
          return { total: null, dataWarning: `Historical rainfall unavailable for ${startDate}. Try refreshing.` };
        }
      };

      const [plantingResult, sprayResult] = await Promise.all([
        sincePlantingDate ? fetchCustomRange(sincePlantingDate) : Promise.resolve({ total: 0 as number, dataWarning: undefined as string | undefined }),
        sinceLastSprayDate ? fetchCustomRange(sinceLastSprayDate) : Promise.resolve({ total: 0 as number, dataWarning: undefined as string | undefined }),
      ]);

      const rangeWarnings = [plantingResult.dataWarning, sprayResult.dataWarning].filter(Boolean);
      const combinedWarning = [mainData.dataWarning, ...rangeWarnings].filter(Boolean).join(' ') || undefined;

      return {
        '24h': Math.round(Number(rain['24h'] || 0) * 1000) / 1000,
        '72h': Math.round(Number(rain['72h'] || 0) * 1000) / 1000,
        '168h': Math.round(Number(rain['168h'] || 0) * 1000) / 1000,
        '7d': Math.round(Number(rain['168h'] || 0) * 1000) / 1000,
        sincePlanting: plantingResult.total,
        sinceLastSpray: sprayResult.total,
        periodEndUtc,
        dataWarning: combinedWarning,
      };
    })();

    promiseCache.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      setTimeout(() => {
        if (promiseCache.get(cacheKey) === fetchPromise) {
          promiseCache.delete(cacheKey);
        }
      }, 30000);
    }
  },


  __test_clearCache(): void {
    promiseCache.clear();
  }
};
