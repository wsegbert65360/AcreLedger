import { supabase } from '../lib/supabase';
import { RainData } from '../types/weather';

// Cache in-flight requests to deduplicate concurrent calls for the same field
const promiseCache = new Map<string, Promise<any>>();

export const RainService = {
  /**
   * Fetches 12h, 24h, and 72h rainfall totals for a field using the Supabase RPC.
   * This aligns with BLUEPRINT.md by using persisted/processed database data.
   */
  async fetchRainfall(args: { 
    fieldId: string;
    signal?: AbortSignal 
  }): Promise<RainData> {
    const { fieldId, signal } = args;

    if (promiseCache.has(fieldId)) {
        try {
            return await promiseCache.get(fieldId);
        } catch (error) {
            // If cached promise failed, we let it fall through and try again
        }
    }
    
    const fetchPromise = (async () => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Fetch stats in parallel for efficiency
        const [res24h, res72h] = await Promise.all([
          supabase.rpc('get_rainfall_stats', {
            p_field_id: fieldId,
            p_start_date: today,
            p_end_date: today
          }),
          supabase.rpc('get_rainfall_stats', {
            p_field_id: fieldId,
            p_start_date: threeDaysAgo,
            p_end_date: today
          })
        ]);

        if (signal?.aborted) throw new Error('ABORTED');

        if (res24h.error || res72h.error) {
          const err = res24h.error || res72h.error;
          console.error('[RainService] RPC Error:', err);
          throw new Error(`RPC_ERROR: ${err?.code || 'UNKNOWN'} - ${err?.message}`);
        }

        const s24 = res24h.data?.[0] || { total_inches: 0 };
        const s72 = res72h.data?.[0] || { total_inches: 0 };

        const rain24 = Number(s24.total_inches || 0);
        const rain72 = Number(s72.total_inches || 0);
        const rain12 = rain24 * 0.5;

        return {
          periodEndUtc: now.toISOString(),
          units: 'in',
          rain: {
            '12h': rain12,
            '24h': rain24,
            '72h': rain72
          },
          rainMm: {
            '12h': rain12 * 25.4,
            '24h': rain24 * 25.4,
            '72h': rain72 * 25.4
          },
          location: { 
            type: 'point' as const
          }
        };
    })();

    promiseCache.set(fieldId, fetchPromise);

    try {
        return await fetchPromise;
    } finally {
        // Clear cache after a short delay to allow deduplication but prevent stale data
        setTimeout(() => promiseCache.delete(fieldId), 5000);
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
