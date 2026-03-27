import { supabase } from '../lib/supabase';
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

        const calls = [
            supabase.rpc('get_rainfall_stats', { p_field_id: fieldId, p_start_date: oneDayAgo, p_end_date: today }), // 24h
            supabase.rpc('get_rainfall_stats', { p_field_id: fieldId, p_start_date: threeDaysAgo, p_end_date: today }), // 72h
            supabase.rpc('get_rainfall_stats', { p_field_id: fieldId, p_start_date: sevenDaysAgo, p_end_date: today }), // 7d
        ];

        if (sincePlantingDate) {
            calls.push(supabase.rpc('get_rainfall_stats', { p_field_id: fieldId, p_start_date: sincePlantingDate, p_end_date: today }));
        }
        if (sinceLastSprayDate) {
            calls.push(supabase.rpc('get_rainfall_stats', { p_field_id: fieldId, p_start_date: sinceLastSprayDate, p_end_date: today }));
        }

        const results = await Promise.all(calls);

        if (signal?.aborted) throw new Error('ABORTED');

        const error = results.find(r => r.error)?.error;
        if (error) {
            const code = error.code || 'UNKNOWN';
            throw new Error(`RPC_ERROR: ${code} - ${error.message}`);
        }

        const getVal = (res: any) => Number(res.data?.[0]?.total_inches || 0);

        return {
            '24h': getVal(results[0]),
            '72h': getVal(results[1]),
            '7d': getVal(results[2]),
            sincePlanting: sincePlantingDate ? getVal(results[3]) : 0,
            sinceLastSpray: sinceLastSprayDate ? getVal(sincePlantingDate ? results[4] : results[3]) : 0,
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
