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

  // Build a mock response matching the new Rain API schema
  const buildApiResponse = (rain: { '12h': number; '24h': number; '72h': number; '168h': number }, opts?: { dataWarning?: string }) => ({
    ok: true,
    json: async () => ({
      location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
      periodEndUtc: '2026-04-20T12:00:00.000Z',
      units: 'in',
      rain,
      rainMm: {
        '12h': rain['12h'] * 25.4,
        '24h': rain['24h'] * 25.4,
        '72h': rain['72h'] * 25.4,
        '168h': rain['168h'] * 25.4,
      },
      ...(opts?.dataWarning ? { dataWarning: opts.dataWarning } : {}),
    }),
  });

  const buildCustomRangeResponse = (rainfall: number) => ({
    ok: true,
    json: async () => ({
      location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
      periodEndUtc: '2026-04-20T12:00:00.000Z',
      units: 'in',
      rainfall,
      rainMm: Number((rainfall * 25.4).toFixed(2)),
    }),
  });

  it('reads 24h, 72h, 7d from rain object directly', async () => {
    (fetch as any).mockResolvedValue(buildApiResponse({
      '12h': 0.2, '24h': 0.4, '72h': 0.9, '168h': 1.0
    }));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.4627, lng: -93.5374,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result['24h']).toBe(0.4);
    expect(result['72h']).toBe(0.9);
    expect(result['7d']).toBe(1.0);
    expect(result.sincePlanting).toBe(0);
    expect(result.sinceLastSpray).toBe(0);
  });

  it('fetches custom ranges via Rain API', async () => {
    (fetch as any)
      .mockResolvedValueOnce(buildApiResponse({
        '12h': 0.2, '24h': 0.4, '72h': 0.9, '168h': 1.0
      }))
      .mockResolvedValueOnce(buildCustomRangeResponse(2.5))
      .mockResolvedValueOnce(buildCustomRangeResponse(0.75));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.4627, lng: -93.5374,
      sincePlantingDate: daysAgo(30), sinceLastSprayDate: daysAgo(14)
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result['24h']).toBe(0.4);
    expect(result.sincePlanting).toBe(2.5);
    expect(result.sinceLastSpray).toBe(0.75);

    // Custom range URLs should include field_id, start_date, end_date
    const customUrl1 = (fetch as any).mock.calls[1][0];
    expect(customUrl1).toContain(`field_id=${mockFieldId}`);
    expect(customUrl1).toContain(`start_date=${daysAgo(30)}`);
    expect(customUrl1).toContain(`end_date=${today()}`);

    const customUrl2 = (fetch as any).mock.calls[2][0];
    expect(customUrl2).toContain(`start_date=${daysAgo(14)}`);
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
    (fetch as any).mockResolvedValue(buildApiResponse({
      '12h': 0, '24h': 0, '72h': 0, '168h': 0
    }));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.4627, lng: -93.5374
    });
    expect(result['24h']).toBe(0);
    expect(result['72h']).toBe(0);
    expect(result['7d']).toBe(0);
  });

  it('extracts centroid from boundary when lat/lng missing', async () => {
    (fetch as any).mockResolvedValue(buildApiResponse({
      '12h': 0.1, '24h': 0.25, '72h': 0.5, '168h': 0.75
    }));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: null, lng: null,
      boundary: {
        type: 'Polygon' as const,
        coordinates: [[[-93.5, 38.46], [-93.54, 38.46], [-93.54, 38.48], [-93.5, 38.48], [-93.5, 38.46]]]
      }
    });
    expect(result['24h']).toBe(0.25);
    expect((fetch as any).mock.calls[0][0]).toContain('lat=38.468');
    expect((fetch as any).mock.calls[0][0]).toContain('lon=-93.516');
  });

  it('extracts centroid from GeoJSON boundary (real format)', async () => {
    (fetch as any).mockResolvedValue(buildApiResponse({
      '12h': 0.1, '24h': 0.25, '72h': 0.5, '168h': 0.75
    }));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: null, lng: null,
      boundary: {
        type: 'Polygon' as const,
        coordinates: [[[-93.5, 38.46], [-93.54, 38.46], [-93.54, 38.48], [-93.5, 38.48], [-93.5, 38.46]]]
      }
    });
    expect(result['24h']).toBe(0.25);
    const calledUrl = (fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('lat=38.468');
    expect(calledUrl).toContain('lon=-93.516');
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
      return buildApiResponse({ '12h': 0.3, '24h': 0.5, '72h': 0.7, '168h': 1.0 });
    });
    const [a, b] = await Promise.all([
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId, lat: 38.46, lng: -93.53 }),
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId, lat: 38.46, lng: -93.53 }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('passes through API dataWarning', async () => {
    (fetch as any).mockResolvedValue(buildApiResponse(
      { '12h': 0.1, '24h': 0.1, '72h': 0.5, '168h': 0.8 },
      { dataWarning: 'IEM Stage IV data — 1-2 hour lag from real-time' }
    ));
    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53
    });
    expect(result.dataWarning).toBe('IEM Stage IV data — 1-2 hour lag from real-time');
  });

  it('no dataWarning when not provided by API', async () => {
    (fetch as any).mockResolvedValue(buildApiResponse({
      '12h': 0.1, '24h': 0.1, '72h': 0.5, '168h': 0.8
    }));
    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53
    });
    expect(result.dataWarning).toBeUndefined();
  });

  it('handles custom range failures gracefully', async () => {
    (fetch as any)
      .mockResolvedValueOnce(buildApiResponse({
        '12h': 0, '24h': 0, '72h': 0, '168h': 0
      }))
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockRejectedValueOnce(new Error('network fail'));

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53,
      sincePlantingDate: daysAgo(30), sinceLastSprayDate: daysAgo(14)
    });
    expect(result.sincePlanting).toBe(0);
    expect(result.sinceLastSpray).toBe(0);
  });

  it('includes field_id in the API request URL', async () => {
    (fetch as any).mockResolvedValue(buildApiResponse({
      '12h': 0, '24h': 0, '72h': 0, '168h': 0
    }));

    await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId, lat: 38.46, lng: -93.53
    });

    const calledUrl = (fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain(`field_id=${mockFieldId}`);
  });
});
