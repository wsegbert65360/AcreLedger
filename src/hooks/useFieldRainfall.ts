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

    const now = Date.now();
    const results: Record<string, number> = {};
    const toFetch = fields.filter(f => {
      const cacheKey = `${f.id}-${f.lat}-${f.lng}`;
      if (rainCache[cacheKey] && (now - rainCache[cacheKey].timestamp < CACHE_TTL)) {
        results[f.id] = rainCache[cacheKey].value;
        return false;
      }
      if (f.lat == null || f.lng == null || isNaN(f.lat) || isNaN(f.lng)) {
        results[f.id] = 0;
        return false;
      }
      return true;
    });

    if (toFetch.length > 0) {
      // Concurrency limit: 3 simultaneous requests
      const CONCURRENCY = 3;
      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        const batch = toFetch.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(async (f) => {
          try {
            const value = await WeatherService.fetchRain24h(f.lat, f.lng);
            results[f.id] = value;
            rainCache[`${f.id}-${f.lat}-${f.lng}`] = { value, timestamp: now };
          } catch (err) {
            console.warn(`Rain fetch failed for ${f.id}:`, err);
            results[f.id] = 0;
          }
        }));
        // Small delay between batches to be safe
        if (i + CONCURRENCY < toFetch.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    setRain(prev => ({ ...prev, ...results }));
    setLoading(false);
    inFlight.current = false;
  }, [fields]);

  useEffect(() => {
    const needsUpdate = fields.some(f => {
      const cacheKey = `${f.id}-${f.lat}-${f.lng}`;
      return !rainCache[cacheKey] || (Date.now() - rainCache[cacheKey].timestamp > CACHE_TTL);
    });
    if (needsUpdate) {
      const timeout = setTimeout(loadAll, 1000);
      return () => clearTimeout(timeout);
    }
  }, [fields, loadAll]);

  return { rain, loading };
}
