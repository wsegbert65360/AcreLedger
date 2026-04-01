import { getRainApiBaseUrl, centroidFromBoundary, sumLastNDays } from '@/utils/rain';

type RainfallResult = {
  '24h': number;
  '72h': number;
  '7d': number;
  sincePlanting: number;
  sinceLastSpray: number;
  periodEndUtc: string;
  dataWarning?: string;
};
const promiseCache = new Map<string, Promise<RainfallResult>>();

export const RainService = {
  async fetchComprehensiveRainfall(args: {
    fieldId: string;
    lat?: number | null;
    lng?: number | null;
    boundary?: { type: string; coordinates: number[][][] } | null;
    sincePlantingDate?: string;
    sinceLastSprayDate?: string;
    signal?: AbortSignal;
  }): Promise<RainfallResult> {
    const { fieldId, lat, lng, boundary, sincePlantingDate, sinceLastSprayDate, signal } = args;

    const cacheKey = `${fieldId}-${lat}-${lng}-${sincePlantingDate || ''}-${sinceLastSprayDate || ''}`;

    const existing = promiseCache.get(cacheKey);
    if (existing) {
      try { return await existing; } catch { /* retry */ }
    }

    const fetchPromise = (async () => {
      const baseUrl = getRainApiBaseUrl();

      if (!baseUrl) {
        throw new Error('VITE_RAIN_API_URL is not configured');
      }

      // Get lat/lng. If missing but boundary exists, compute centroid from boundary.
      let tLat = lat != null ? Math.round(lat * 10000) / 10000 : null;
      let tLng = lng != null ? Math.round(lng * 10000) / 10000 : null;

      if ((tLat == null || tLng == null) && boundary) {
        const centroid = centroidFromBoundary(boundary as any);
        if (centroid) {
          tLat = Math.round(centroid[0] * 10000) / 10000;
          tLng = Math.round(centroid[1] * 10000) / 10000;
        }
      }

      if (tLat == null || tLng == null) {
        throw new Error('Missing location data (lat/lng or boundary) for rainfall lookup.');
      }

      // --- Main call: GET /rain?lat=X&lon=Y&days=7 (IEM Stage IV) ---
      // Returns: { rainfall, breakdown: { "YYYY-MM-DD": inches }, period, mode }
      const mainResponse = await fetch(`${baseUrl}?lat=${tLat}&lon=${tLng}&days=7`, { signal });

      if (!mainResponse.ok) {
        const err = await mainResponse.json().catch(() => ({}));
        throw new Error(`RAIN_API_ERROR: ${mainResponse.status} - ${err.error || 'Unknown error'}`);
      }

      const mainData = await mainResponse.json();
      const breakdown: Record<string, number> = mainData.breakdown || {};

      // Compute 24h, 72h, 7d from per-day breakdown
      const inches24h = sumLastNDays(breakdown, 1);
      const inches72h = sumLastNDays(breakdown, 3);
      const inches7d = Number(mainData.rainfall) || sumLastNDays(breakdown, 7);

      const periodEndUtc = mainData.period?.end
        ? `${mainData.period.end}T23:59:59Z`
        : new Date().toISOString();

      const dataWarning = mainData.mode === 'iem' ? 'IEM Stage IV data — 1-2 hour lag from real-time' : undefined;

      // --- Custom range calls: field_id + start_date/end_date (Supabase RPC) ---
      const fetchCustomRange = async (startDate: string): Promise<number> => {
        const today = new Date().toISOString().split('T')[0];
        try {
          const r = await fetch(`${baseUrl}?field_id=${fieldId}&start_date=${startDate}&end_date=${today}`, { signal });
          if (!r.ok) return 0;
          const d = await r.json();
          return Number(d.rainfall || 0);
        } catch { return 0; }
      };

      const [sincePlanting, sinceLastSpray] = await Promise.all([
        sincePlantingDate ? fetchCustomRange(sincePlantingDate) : Promise.resolve(0),
        sinceLastSprayDate ? fetchCustomRange(sinceLastSprayDate) : Promise.resolve(0),
      ]);

      return {
        '24h': Math.round(inches24h * 1000) / 1000,
        '72h': Math.round(inches72h * 1000) / 1000,
        '7d': Math.round(inches7d * 1000) / 1000,
        sincePlanting: Math.round(sincePlanting * 1000) / 1000,
        sinceLastSpray: Math.round(sinceLastSpray * 1000) / 1000,
        periodEndUtc,
        dataWarning
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
  },

  /** Clear all cached rainfall promises (call on logout to prevent stale data) */
  clearCache(): void {
    promiseCache.clear();
  }
};
