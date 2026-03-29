import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RainService } from '../RainService';

describe('RainService', () => {
  const mockFieldId = 'test-field-id';
  const mockApiUrl = 'https://api.example.com';

  beforeEach(() => {
    vi.clearAllMocks();
    RainService.__test_clearCache();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('VITE_RAIN_API_URL', mockApiUrl);
  });

  const today = () => new Date().toISOString().split('T')[0];
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().split('T')[0];
  };

  // Build a mock response matching what RainAPI actually returns (IEM mode)
  const buildIemResponse = (breakdown: Record<string, number>) => {
    const dates = Object.keys(breakdown).sort();
    const total = dates.reduce((sum, d) => sum + breakdown[d], 0);
    return {
      ok: true,
      json: async () => ({
        mode: 'iem',
        location: { lat: 38.4627, lon: -93.5374 },
        period: { start: dates[0], end: dates[dates.length - 1], days: dates.length },
        rainfall: Math.round(total * 1000) / 1000,
        breakdown: Object.fromEntries(dates.map(d => [d, Math.round(breakdown[d] * 1000) / 1000])),
        units: 'inches',
        source: 'IEM Stage IV',
      }),
    };
  };

  it('computes 24h, 72h, 7d from breakdown', async () => {
    // Day values: 0, 0, 0, 0.1, 0.3, 0.2, 0.4 (today=0.4, last 3 days=0.9, total=1.0)
    const breakdown: Record<string, number> = {};
    [0, 0, 0, 0.1, 0.3, 0.2, 0.4].forEach((v, i) => { breakdown[daysAgo(6 - i)] = v; });

    (fetch as any)
      .mockResolvedValueOnce(buildIemResponse(breakdown))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rainfall: 1.0 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rainfall: 0.5 }) });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.4627, lng: -93.5374,
      sincePlantingDate: daysAgo(30), sinceLastSprayDate: daysAgo(14)
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result['24h']).toBe(0.4);
    expect(result['72h']).toBe(0.9);
    expect(result['7d']).toBe(1.0);
    expect(result.sincePlanting).toBe(1.0);
    expect(result.sinceLastSpray).toBe(0.5);
  });

  it('handles API errors', async () => {
    (fetch as any).mockResolvedValue({
      ok: false, status: 500, json: async () => ({ error: 'Server Error' })
    });
    await expect(RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.4627, lng: -93.5374
    })).rejects.toThrow('RAIN_API_ERROR: 500 - Server Error');
  });

  it('handles zero rainfall', async () => {
    const breakdown: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) breakdown[daysAgo(i)] = 0;
    (fetch as any).mockResolvedValue(buildIemResponse(breakdown));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.4627, lng: -93.5374
    });
    expect(result['24h']).toBe(0);
    expect(result['72h']).toBe(0);
    expect(result['7d']).toBe(0);
  });

  it('extracts centroid from boundary when lat/lng missing', async () => {
    (fetch as any).mockResolvedValue(buildIemResponse({ [today()]: 0.25 }));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: null, lng: null,
      boundary: [[-93.5, 38.46], [-93.54, 38.46], [-93.54, 38.48], [-93.5, 38.48], [-93.5, 38.46]]
    });
    expect(result['24h']).toBe(0.25);
    expect((fetch as any).mock.calls[0][0]).toContain('lat=');
  });

  it('throws when no location data at all', async () => {
    await expect(RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId
    })).rejects.toThrow('Missing location data');
  });

  it('throws when VITE_RAIN_API_URL is empty', async () => {
    vi.stubEnv('VITE_RAIN_API_URL', '');
    await expect(RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53
    })).rejects.toThrow('VITE_RAIN_API_URL is not configured');
  });

  it('deduplicates concurrent requests', async () => {
    (fetch as any).mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return buildIemResponse({ [today()]: 0.5 });
    });
    const [a, b] = await Promise.all([
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId, lat: 38.46, lng: -93.53 }),
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId, lat: 38.46, lng: -93.53 }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('includes IEM data warning', async () => {
    (fetch as any).mockResolvedValue(buildIemResponse({ [today()]: 0.1 }));
    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53
    });
    expect(result.dataWarning).toContain('IEM Stage IV');
  });

  it('identifies CONUS coordinates', () => {
    expect(RainService.isWithinCONUS(39.0, -95.0)).toBe(true);
    expect(RainService.isWithinCONUS(64.0, -150.0)).toBe(false);
    expect(RainService.isWithinCONUS(23.0, -100.0)).toBe(false);
    expect(RainService.isWithinCONUS(40.0, -126.0)).toBe(false);
  });

  it('handles custom range failures gracefully', async () => {
    const breakdown: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) breakdown[daysAgo(i)] = 0;
    (fetch as any)
      .mockResolvedValueOnce(buildIemResponse(breakdown))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce(new Promise((_, reject) => setTimeout(() => reject(new Error('fail')), 10)));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53,
      sincePlantingDate: daysAgo(30), sinceLastSprayDate: daysAgo(14)
    });
    expect(result['24h']).toBe(0);
    expect(result.sincePlanting).toBe(0);
    expect(result.sinceLastSpray).toBe(0);
  });
});
