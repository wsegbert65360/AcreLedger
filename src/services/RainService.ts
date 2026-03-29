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
   * 24h, 72h, 168h (7d), and optionally since specific dates.
   */
  async fetchComprehensiveRainfall(args: {
    fieldId: string;
    lat?: number | null;
    lng?: number | null;
    boundary?: any; // Supports GeoJSON Polygon or [lon, lat][]
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
    dataWarning?: string;
  }> {
    const { fieldId, lat, lng, boundary, sincePlantingDate, sinceLastSprayDate, signal } = args;

    // Cache key includes dates and coordinates to prevent stale lookup
    const cacheKey = `${fieldId}-${lat}-${lng}-${sincePlantingDate || ''}-${sinceLastSprayDate || ''}`;

    if (promiseCache.has(cacheKey)) {
        try {
            return await promiseCache.get(cacheKey);
        } catch (error) {
            // Ignore cached failure and retry
        }
    }

    const fetchPromise = (async () => {
        const baseUrl = import.meta.env?.VITE_RAIN_API_URL || 
                       (typeof process !== 'undefined' ? process.env?.VITE_RAIN_API_URL : undefined);
        
        if (!baseUrl) {
            console.error('Rain API Configuration Error: VITE_RAIN_API_URL is not defined in environment.');
            throw new Error('VITE_RAIN_API_URL is not configured');
        }

        // 1. Primary call for 24h, 72h, 7d using the new high-resolution API
        // Prefer boundary (polygon) if available, fallback to lat/lon
        let mainResponse;
        if (boundary) {
            mainResponse = await fetch(`${baseUrl}/rain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ polygon: boundary, field_id: fieldId }),
                signal
            });
        } else if (lat != null && lng != null) {
            mainResponse = await fetch(`${baseUrl}/rain?lat=${lat}&lon=${lng}&field_id=${fieldId}`, { signal });
        } else {
            throw new Error('Missing location data (lat/lng or boundary) for rainfall lookup.');
        }

        if (!mainResponse.ok) {
            const errorData = await mainResponse.json().catch(() => ({}));
            throw new Error(`RAIN_API_ERROR: ${mainResponse.status} - ${errorData.error || 'Unknown error'}`);
        }
        
        const mainData = await mainResponse.json();

        // 2. Helper for custom ranges (sincePlanting, sinceLastSpray)
        // For now, we continue to use the daily start_date / end_date mode of the API for these.
        const fetchCustomRange = async (startDate: string) => {
            const today = new Date().toISOString().split('T')[0];
            const url = `${baseUrl}/rain?field_id=${fieldId}&start_date=${startDate}&end_date=${today}`;
            try {
                const response = await fetch(url, { signal });
                if (!response.ok) return 0;
                const data = await response.json();
                return Number(data.rainfall || 0);
            } catch (err) {
                console.warn(`Custom range fetch failed for ${startDate}`, err);
                return 0;
            }
        };

        const [sincePlanting, sinceLastSpray] = await Promise.all([
            sincePlantingDate ? fetchCustomRange(sincePlantingDate) : Promise.resolve(0),
            sinceLastSprayDate ? fetchCustomRange(sinceLastSprayDate) : Promise.resolve(0),
        ]);

        return {
            '24h': mainData.rain['24h'],
            '72h': mainData.rain['72h'],
            '7d': mainData.rain['168h'],
            sincePlanting,
            sinceLastSpray,
            periodEndUtc: mainData.periodEndUtc,
            dataWarning: mainData.dataWarning
        };
    })();

    promiseCache.set(cacheKey, fetchPromise);

    try {
        return await fetchPromise;
    } finally {
        // Clear cache after 60 seconds to allow reuse but keep data fresh
        setTimeout(() => promiseCache.delete(cacheKey), 60000);
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
