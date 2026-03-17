import { RainData } from '../types/weather';

const RAIN_API_BASE_URL = 'https://rain-api.vercel.app';

export const RainService = {
  /**
   * Fetches 12h, 24h, and 72h rainfall totals for a field.
   * Uses POST for polygons (GeoJSON) and GET for lat/lng points.
   */
  async fetchRainfall(args: { 
    lat?: number; 
    lon?: number; 
    polygon?: [number, number][]; 
    signal?: AbortSignal 
  }): Promise<RainData> {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { lat, lon, polygon, signal } = args;

    let res: Response;

    if (polygon && polygon.length > 0) {
      // POST polygon query
      res = await fetch(`${RAIN_API_BASE_URL}/rain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon, tz }),
        signal
      });
    } else if (lat != null && lon != null) {
      // GET point query
      const params = new URLSearchParams({ 
        lat: String(lat), 
        lon: String(lon), 
        tz 
      });
      res = await fetch(`${RAIN_API_BASE_URL}/rain?${params}`, { signal });
    } else {
      throw new Error('Missing location data for rainfall query');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown API error' }));
      throw new Error(`Rain API error ${res.status}: ${err.error || res.statusText}`);
    }

    return res.json();
  },

  /**
   * Helper to check if coordinates are within the Continental US.
   */
  isWithinCONUS(lat: number, lon: number): boolean {
    return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  }
};
