import { useState, useEffect, useCallback, useRef } from 'react';
import { Field } from '@/types/farm';
import { WeatherService } from '@/services/WeatherService';

const rainCache: Record<string, { value: number; timestamp: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

export function useFieldRainfall(fields: Field[]) {
  const [rain, setRain] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false); // ← ref-based guard, no stale closure

  const loadAll = useCallback(async () => {
    if (inFlight.current || fields.length === 0) return;
    inFlight.current = true;
    setLoading(true);

    const results: Record<string, number> = {};
    const now = Date.now();

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];

      if (rainCache[f.id] && (now - rainCache[f.id].timestamp < CACHE_TTL)) {
        results[f.id] = rainCache[f.id].value;
        continue;
      }

      // Validate coords to avoid 400/NaN errors
      if (!f.lat || !f.lng || isNaN(f.lat) || isNaN(f.lng)) {
        results[f.id] = 0;
        continue;
      }

      try {
        const value = await WeatherService.fetchRain24h(f.lat, f.lng);
        results[f.id] = value;
        rainCache[f.id] = { value, timestamp: now };
      } catch (err) {
        console.warn(`Rain fetch failed for ${f.id}:`, err);
        results[f.id] = 0;
      }

      // Wait between requests to honor rate limits, but don't setRain on every iteration
      if (i < fields.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setRain(prev => ({ ...prev, ...results }));
    setLoading(false);
    inFlight.current = false;
  }, [fields]);

  useEffect(() => {
    const needsUpdate = fields.some(
      f => !rainCache[f.id] || (Date.now() - rainCache[f.id].timestamp > CACHE_TTL)
    );
    if (needsUpdate) {
      const timeout = setTimeout(loadAll, 1000);
      return () => clearTimeout(timeout);
    }
  }, [fields.length, loadAll]);

  return { rain, loading };
}
