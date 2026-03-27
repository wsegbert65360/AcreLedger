import { supabase } from '../lib/supabase';

// Cache in-flight requests to deduplicate concurrent calls for the same location
const promiseCache = new Map<string, Promise<any>>();

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

export const RainService = {
  /**
   * Fetches comprehensive rainfall stats for multiple periods including:
   * 24h, 72h, 7d, and optionally since specific dates (planting, last spray).
   * Now uses Visual Crossing Timeline API for near real-time hourly resolution.
   */
  async fetchComprehensiveRainfall(args: {
    lat: number;
    lng: number;
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
    const { lat, lng, sincePlantingDate, sinceLastSprayDate, signal } = args;

    if (!API_KEY || API_KEY === 'undefined') {
      throw new Error('Visual Crossing API key is missing');
    }

    // Cache key includes dates and coordinates
    const cacheKey = `${lat},${lng}-${sincePlantingDate || ''}-${sinceLastSprayDate || ''}`;

    if (promiseCache.has(cacheKey)) {
        try {
            return await promiseCache.get(cacheKey);
        } catch (error) {
            // Ignore cached failure and retry
        }
    }

    const fetchPromise = (async () => {
        const now = new Date();
        const currentEpoch = Math.floor(now.getTime() / 1000);
        const todayStr = now.toISOString().split('T')[0];

        const getDaysAgo = (days: number) => {
            const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            return d.toISOString().split('T')[0];
        };

        const sevenDaysAgoStr = getDaysAgo(7);

        // Determine the earliest date we need data for
        let earliestDateStr = sevenDaysAgoStr;
        if (sincePlantingDate && new Date(sincePlantingDate) < new Date(earliestDateStr)) {
            earliestDateStr = new Date(sincePlantingDate).toISOString().split('T')[0];
        }
        if (sinceLastSprayDate && new Date(sinceLastSprayDate) < new Date(earliestDateStr)) {
            earliestDateStr = new Date(sinceLastSprayDate).toISOString().split('T')[0];
        }

        const location = `${lat},${lng}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        if (signal) {
            signal.addEventListener('abort', () => controller.abort());
        }

        try {
            const url = `${VC_BASE_URL}/${location}/${earliestDateStr}/${todayStr}?unitGroup=us&key=${API_KEY}&contentType=json&include=days,hours&elements=datetimeEpoch,precip`;

            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.statusText}`);
            }

            const data = await response.json();
            const days = data.days || [];

            // Flatten all hours and sort descending by epoch
            const allHours = days.flatMap((d: any) => d.hours || []).sort((a: any, b: any) => b.datetimeEpoch - a.datetimeEpoch);

            let precip24h = 0;
            let precip72h = 0;
            let precip7d = 0;
            let sincePlanting = 0;
            let sinceLastSpray = 0;

            const plantingEpoch = sincePlantingDate ? Math.floor(new Date(sincePlantingDate).getTime() / 1000) : null;
            const sprayEpoch = sinceLastSprayDate ? Math.floor(new Date(sinceLastSprayDate).getTime() / 1000) : null;

            for (const hour of allHours) {
                // Only consider hours that are <= current time to avoid future forecasts
                if (hour.datetimeEpoch <= currentEpoch) {
                    const p = hour.precip || 0;

                    if (hour.datetimeEpoch > currentEpoch - 24 * 3600) {
                        precip24h += p;
                    }
                    if (hour.datetimeEpoch > currentEpoch - 72 * 3600) {
                        precip72h += p;
                    }
                    if (hour.datetimeEpoch > currentEpoch - 7 * 24 * 3600) {
                        precip7d += p;
                    }
                    if (plantingEpoch !== null && hour.datetimeEpoch >= plantingEpoch) {
                        sincePlanting += p;
                    }
                    if (sprayEpoch !== null && hour.datetimeEpoch >= sprayEpoch) {
                        sinceLastSpray += p;
                    }
                }
            }

            // Helper to round to 2 decimals
            const round2 = (num: number) => Math.round(num * 100) / 100;

            return {
                '24h': round2(precip24h),
                '72h': round2(precip72h),
                '7d': round2(precip7d),
                sincePlanting: round2(sincePlanting),
                sinceLastSpray: round2(sinceLastSpray),
                periodEndUtc: now.toISOString()
            };
        } finally {
            clearTimeout(timeoutId);
        }
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
