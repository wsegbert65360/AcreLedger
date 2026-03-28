import { RainData } from '../types/weather';

// Cache in-flight requests to deduplicate concurrent calls for the same field
const promiseCache = new Map<string, Promise<any>>();

export const RainService = {
  /**
   * Fetches 12h, 24h, and 72h rainfall totals for a field using the Supabase RPC.
   * This aligns with BLUEPRINT.md by using persisted/processed database data.
   */
  /**
   * Fetches comprehensive rainfall stats for multiple periods including:
   * 24h, 72h, 7d, and optionally since specific dates (planting, last spray).
   */
  async fetchComprehensiveRainfall(args: {
    fieldId: string;
    sincePlantingDate?: string;
    sinceLastSprayDate?: string;
    signal?: AbortSignal;
  }): Promise<{
    '24h': number;
    '72h': number;
    '7d': number;
    sincePlanting: number;
    sinceLastSpray: number;
    periodEndUtc: string;
  }> {
    const { fieldId, sincePlantingDate, sinceLastSprayDate, signal } = args;

    // Cache key includes dates to prevent stale data if activity changes
    const cacheKey = `${fieldId}-${sincePlantingDate || ''}-${sinceLastSprayDate || ''}`;

    if (promiseCache.has(cacheKey)) {
        try {
            return await promiseCache.get(cacheKey);
        } catch (error) {
            // Ignore cached failure and retry
        }
    }

    const fetchPromise = (async () => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        const getDaysAgo = (days: number) => {
            const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            return d.toISOString().split('T')[0];
        };

        const oneDayAgo = getDaysAgo(1);
        const threeDaysAgo = getDaysAgo(3);
        const sevenDaysAgo = getDaysAgo(7);

        const baseUrl = import.meta.env.VITE_RAIN_API_URL;
        if (!baseUrl) {
            throw new Error('VITE_RAIN_API_URL is not configured');
        }

        const fetchRain = async (startDate: string, endDate: string) => {
            const url = `${baseUrl}?field_id=${fieldId}&start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url, { signal });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`RAIN_API_ERROR: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }
            const data = await response.json();
            return Number(data.rainfall || 0);
        };

        const results = await Promise.all([
            fetchRain(oneDayAgo, today), // 24h
            fetchRain(threeDaysAgo, today), // 72h
            fetchRain(sevenDaysAgo, today), // 7d
            sincePlantingDate ? fetchRain(sincePlantingDate, today) : Promise.resolve(0),
            sinceLastSprayDate ? fetchRain(sinceLastSprayDate, today) : Promise.resolve(0),
        ]);

        if (signal?.aborted) throw new Error('ABORTED');

        return {
            '24h': results[0],
            '72h': results[1],
            '7d': results[2],
            sincePlanting: results[3],
            sinceLastSpray: results[4],
            periodEndUtc: now.toISOString()
        };
    })();

    promiseCache.set(cacheKey, fetchPromise);

    try {
        return await fetchPromise;
    } finally {
        // Clear cache after 15 seconds to allow reuse but keep data fresh
        setTimeout(() => promiseCache.delete(cacheKey), 15000);
    }
  },

  /**
   * Helper to check if coordinates are within the Continental US.
   */
  isWithinCONUS(lat: number, lon: number): boolean {
    return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  },

  /**
   * Internal test helper to clear the promise cache.
   */
  __test_clearCache(): void {
    promiseCache.clear();
  }
};
