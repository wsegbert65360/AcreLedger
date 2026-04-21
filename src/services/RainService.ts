import { supabase } from '@/lib/supabase';

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
      const baseUrl = import.meta.env?.VITE_RAIN_API_URL ||
                     (typeof process !== 'undefined' ? process.env?.VITE_RAIN_API_URL : undefined);

      if (!baseUrl) {
        throw new Error('VITE_RAIN_API_URL is not configured');
      }

      let tLat = lat != null ? Math.round(lat * 10000) / 10000 : null;
      let tLng = lng != null ? Math.round(lng * 10000) / 10000 : null;

      if ((tLat == null || tLng == null) && boundary) {
        const coords = Array.isArray(boundary) ? boundary : boundary?.coordinates?.[0];
        if (coords && coords.length > 0) {
          const sumLat = coords.reduce((s: number, c: any) => s + (Array.isArray(c) ? c[1] : c.lat), 0);
          const sumLng = coords.reduce((s: number, c: any) => s + (Array.isArray(c) ? c[0] : c.lng), 0);
          tLat = Math.round((sumLat / coords.length) * 10000) / 10000;
          tLng = Math.round((sumLng / coords.length) * 10000) / 10000;
        }
      }

      if (tLat == null || tLng == null) {
        throw new Error('Missing location data (lat/lng or boundary) for rainfall lookup.');
      }

      // GET /rain?lat=X&lon=Y&field_id=Z — IEM Stage IV merged with Supabase server-side
      const mainResponse = await fetch(
        `${baseUrl}/rain?lat=${tLat}&lon=${tLng}&field_id=${fieldId}`,
        { signal }
      );

      if (!mainResponse.ok) {
        const err = await mainResponse.json().catch(() => ({}));
        throw new Error(`RAIN_API_ERROR: ${mainResponse.status} - ${err.error || 'Unknown error'}`);
      }

      const mainData = await mainResponse.json();
      const rain = mainData.rain ?? {};
      const periodEndUtc = mainData.periodEndUtc || new Date().toISOString();

      // --- Custom range calls: Supabase RPC get_rainfall_stats ---
      const fetchCustomRange = async (startDate: string): Promise<number> => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const { data, error } = await supabase.rpc('get_rainfall_stats', {
            p_field_id: fieldId,
            p_start_date: startDate,
            p_end_date: today,
          });
          if (error || !data) return 0;
          const row = Array.isArray(data) ? data[0] : data;
          return Number(row?.total_inches || 0);
        } catch { return 0; }
      };

      const [sincePlanting, sinceLastSpray] = await Promise.all([
        sincePlantingDate ? fetchCustomRange(sincePlantingDate) : Promise.resolve(0),
        sinceLastSprayDate ? fetchCustomRange(sinceLastSprayDate) : Promise.resolve(0),
      ]);

      return {
        '24h': Math.round(Number(rain['24h'] || 0) * 1000) / 1000,
        '72h': Math.round(Number(rain['72h'] || 0) * 1000) / 1000,
        '7d': Math.round(Number(rain['168h'] || 0) * 1000) / 1000,
        sincePlanting: Math.round(sincePlanting * 1000) / 1000,
        sinceLastSpray: Math.round(sinceLastSpray * 1000) / 1000,
        periodEndUtc,
        dataWarning: mainData.dataWarning || undefined,
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
