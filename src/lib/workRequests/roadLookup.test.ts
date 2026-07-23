import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lookupNearbyRoad, enforceThrottle, _resetThrottleForTests, NOMINATIM_ATTRIBUTION } from './roadLookup';

beforeEach(() => {
  _resetThrottleForTests();
});

describe('NOMINATIM_ATTRIBUTION', () => {
  it('credits OpenStreetMap contributors', () => {
    expect(NOMINATIM_ATTRIBUTION).toContain('OpenStreetMap');
  });
});

describe('enforceThrottle', () => {
  it('returns immediately on the first call (no prior request)', async () => {
    _resetThrottleForTests();
    const start = Date.now();
    await enforceThrottle();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('paces subsequent calls to at least ~1 second apart', async () => {
    _resetThrottleForTests();
    await enforceThrottle(); // first call sets lastRequestTime
    const start = Date.now();
    await enforceThrottle(Date.now()); // second call must wait
    // Throttle interval is 1100ms; allow scheduling slack.
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });
});

describe('lookupNearbyRoad', () => {
  it('extracts the road name from a Nominatim response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        address: { road: 'County Road 12' },
        lat: '38.5', lon: '-93.2',
      }),
    }) as unknown as typeof fetch;

    const result = await lookupNearbyRoad(38.5, -93.2, fetchImpl);
    expect(result.name).toBe('County Road 12');
    expect(result.point).toEqual({ lat: 38.5, lng: -93.2 });
  });

  it('falls back to pedestrian/footway when road is absent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ address: { pedestrian: 'Main Trail' }, lat: '38.5', lon: '-93.2' }),
    }) as unknown as typeof fetch;
    const result = await lookupNearbyRoad(38.5, -93.2, fetchImpl);
    expect(result.name).toBe('Main Trail');
  });

  it('returns an empty result when no road-like field exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ address: { country: 'US' }, lat: '38.5', lon: '-93.2' }),
    }) as unknown as typeof fetch;
    const result = await lookupNearbyRoad(38.5, -93.2, fetchImpl);
    expect(result.name).toBeUndefined();
  });

  it('returns an empty result on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const result = await lookupNearbyRoad(38.5, -93.2, fetchImpl);
    expect(result).toEqual({});
  });

  it('returns an empty result when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const result = await lookupNearbyRoad(38.5, -93.2, fetchImpl);
    expect(result).toEqual({});
  });

  it('returns an empty result for invalid coordinates', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await lookupNearbyRoad(NaN, -93.2, fetchImpl);
    expect(result).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('handles Nominatim error payloads gracefully', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Unable to geocode' }),
    }) as unknown as typeof fetch;
    const result = await lookupNearbyRoad(0, 0, fetchImpl);
    expect(result).toEqual({});
  });
});
