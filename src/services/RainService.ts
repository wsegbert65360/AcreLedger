export type RainfallResult = {
  '24h': number;
  '72h': number;
  '168h': number;
  '7d': number; // Alias for 168h, always provided by the service
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
      // Use the environment variable
      let baseUrl = import.meta.env.VITE_RAIN_API_URL;

      if (!baseUrl) {
        throw new Error('VITE_RAIN_API_URL is not configured');
      }

      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
        throw new Error('VITE_RAIN_API_URL must use HTTPS');
      }

      // Sanitize URL: trim whitespace/newlines, strip trailing slashes, and strip duplicate /rain suffix
      baseUrl = baseUrl.trim().replace(/\/+$/, '');
      if (baseUrl.endsWith('/rain')) {
        baseUrl = baseUrl.slice(0, -5);
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

      // GET /rain?lat=X&lon=Y&field_id=Z — IEM Stage IV radar data
      const mainResponse = await fetch(
        `${baseUrl}/rain?lat=${tLat}&lon=${tLng}&field_id=${encodeURIComponent(fieldId)}`,
        { signal }
      );

      if (!mainResponse.ok) {
        const err = await mainResponse.json().catch(() => ({}));
        throw new Error(`RAIN_API_ERROR: ${mainResponse.status} - ${err.error || 'Unknown error'}`);
      }

      const mainData = await mainResponse.json();
      const rain = mainData.rain ?? {};
      const periodEndUtc = mainData.periodEndUtc || new Date().toISOString();

      // --- Custom range via Rain API (field-based historical lookup) ---
      const fetchCustomRange = async (startDate: string): Promise<number> => {
        try {
          const today = new Date().toISOString().split('T')[0];
          // Use hybrid Mode D: includes coordinates for radar data merge
          const response = await fetch(
            `${baseUrl}/rain?field_id=${encodeURIComponent(fieldId)}&lat=${tLat}&lon=${tLng}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(today)}`,
            { signal }
          );
          if (!response.ok) return 0;
          const data = await response.json();
          return Math.round(Number(data.rain?.total || 0) * 1000) / 1000;
        } catch { return 0; }
      };

      const [sincePlanting, sinceLastSpray] = await Promise.all([
        sincePlantingDate ? fetchCustomRange(sincePlantingDate) : Promise.resolve(0),
        sinceLastSprayDate ? fetchCustomRange(sinceLastSprayDate) : Promise.resolve(0),
      ]);

      return {
        '24h': Math.round(Number(rain['24h'] || 0) * 1000) / 1000,
        '72h': Math.round(Number(rain['72h'] || 0) * 1000) / 1000,
        '168h': Math.round(Number(rain['168h'] || 0) * 1000) / 1000,
        '7d': Math.round(Number(rain['168h'] || 0) * 1000) / 1000,
        sincePlanting,
        sinceLastSpray,
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
