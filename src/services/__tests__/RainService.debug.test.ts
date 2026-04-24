import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RainService } from '../RainService';

describe('RainService - Zero Rainfall Debug Tests', () => {
  const mockFieldId = 'debug-field-id';
  const mockApiUrl = 'https://api.example.com';

  beforeEach(() => {
    vi.clearAllMocks();
    RainService.__test_clearCache();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('VITE_RAIN_API_URL', mockApiUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: Basic radar lookup returns data
  it('should return rainfall data for basic radar lookup', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
        periodEndUtc: '2026-04-20T12:00:00.000Z',
        units: 'in',
        rain: {
          '12h': 0.2,
          '24h': 0.4,
          '72h': 0.9,
          '168h': 1.0
        }
      })
    });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374
    });

    expect(result['24h']).toBe(0.4);
    expect(result['72h']).toBe(0.9);
    expect(result['7d']).toBe(1.0);
  });

  // Test 2: Custom range with data returns values
  it('should return custom range data when API provides it', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
          periodEndUtc: '2026-04-20T12:00:00.000Z',
          units: 'in',
          rain: {
            '12h': 0,
            '24h': 0,
            '72h': 0,
            '168h': 0
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 2.5 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 0.75 } })
      });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374,
      sincePlantingDate: '2026-03-15',
      sinceLastSprayDate: '2026-04-01'
    });

    expect(result.sincePlanting).toBe(2.5);
    expect(result.sinceLastSpray).toBe(0.75);
  });

  // Test 3: Custom range with modern response format
  it('should handle rain.total response format', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
          periodEndUtc: '2026-04-20T12:00:00.000Z',
          units: 'in',
          rain: {
            '12h': 0,
            '24h': 0,
            '72h': 0,
            '168h': 0
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 1.8 } }) // Modern format
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 3.2 } }) // Nested format
      });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374,
      sincePlantingDate: '2026-03-15',
      sinceLastSprayDate: '2026-04-01'
    });

    expect(result.sincePlanting).toBe(1.8);
    expect(result.sinceLastSpray).toBe(3.2);

    // Verify lat/lon are passed
    const calls = (fetch as any).mock.calls;
    expect(calls[1][0]).toContain('lat=38.4627');
    expect(calls[1][0]).toContain('lon=-93.5374');
    expect(calls[2][0]).toContain('lat=38.4627');
    expect(calls[2][0]).toContain('lon=-93.5374');
  });

  // Test 4: Custom range API failure returns 0
  it('should return 0 for custom ranges when API fails', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
          periodEndUtc: '2026-04-20T12:00:00.000Z',
          units: 'in',
          rain: {
            '12h': 0,
            '24h': 0,
            '72h': 0,
            '168h': 0
          }
        })
      })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374,
      sincePlantingDate: '2026-03-15',
      sinceLastSprayDate: '2026-04-01'
    });

    expect(result.sincePlanting).toBe(0);
    expect(result.sinceLastSpray).toBe(0);
  });

  // Test 5: Field without coordinates but with boundary
  it('should extract centroid from boundary when lat/lng missing', async () => {
    const boundary = {
      type: 'Polygon' as const,
      coordinates: [[
        [-93.5, 38.46],
        [-93.54, 38.46],
        [-93.54, 38.48],
        [-93.5, 38.48],
        [-93.5, 38.46]
      ]]
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        location: { type: 'point', lat: 38.468, lon: -93.516, fieldId: mockFieldId },
        periodEndUtc: '2026-04-20T12:00:00.000Z',
        units: 'in',
        rain: {
          '12h': 0.1,
          '24h': 0.25,
          '72h': 0.5,
          '168h': 0.75
        }
      })
    });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: null,
      lng: null,
      boundary
    });

    expect(result['24h']).toBe(0.25);
    const calledUrl = (fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('lat=38.468');
    expect(calledUrl).toContain('lon=-93.516');
  });

  // Test 6: Missing both coordinates and boundary
  it('should throw error when no location data available', async () => {
    await expect(RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: null,
      lng: null,
      boundary: null
    })).rejects.toThrow('Missing location data');
  });

  // Test 7: Missing API URL configuration
  it('should throw error when VITE_RAIN_API_URL is not configured', async () => {
    vi.stubEnv('VITE_RAIN_API_URL', '');

    await expect(RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374
    })).rejects.toThrow('VITE_RAIN_API_URL is not configured');
  });

  // Test 8: DataWarning propagation
  it('should pass through API data warnings', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
        periodEndUtc: '2026-04-20T12:00:00.000Z',
        units: 'in',
        rain: {
          '12h': 0.1,
          '24h': 0.1,
          '72h': 0.5,
          '168h': 0.8
        },
        dataWarning: 'IEM Stage IV data — 1-2 hour lag from real-time'
      })
    });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374
    });

    expect(result.dataWarning).toBe('IEM Stage IV data — 1-2 hour lag from real-time');
  });

  // Test 9: Zero values handling
  it('should correctly handle zero rainfall values', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
        periodEndUtc: '2026-04-20T12:00:00.000Z',
        units: 'in',
        rain: {
          '12h': 0,
          '24h': 0,
          '72h': 0,
          '168h': 0
        }
      })
    });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374
    });

    expect(result['24h']).toBe(0);
    expect(result['72h']).toBe(0);
    expect(result['7d']).toBe(0);
  });

  // Test 10: Coordinate rounding
  it('should round coordinates to 4 decimal places', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        location: { type: 'point', lat: 38.4627, lon: -93.5375, fieldId: mockFieldId },
        periodEndUtc: '2026-04-20T12:00:00.000Z',
        units: 'in',
        rain: {
          '12h': 0,
          '24h': 0,
          '72h': 0,
          '168h': 0
        }
      })
    });

    await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627123, // Extra precision
      lng: -93.5374567  // Extra precision, rounds to -93.5375
    });

    const calledUrl = (fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('lat=38.4627');
    expect(calledUrl).toContain('lon=-93.5375');
  });

  // Test 11: Request deduplication
  it('should deduplicate concurrent requests', async () => {
    (fetch as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        ok: true,
        json: async () => ({
          location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
          periodEndUtc: '2026-04-20T12:00:00.000Z',
          units: 'in',
          rain: {
            '12h': 0.1,
            '24h': 0.2,
            '72h': 0.5,
            '168h': 1.0
          }
        })
      };
    });

    const [result1, result2] = await Promise.all([
      RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: 38.4627,
        lng: -93.5374
      }),
      RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: 38.4627,
        lng: -93.5374
      })
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });

  // Test 12: Custom range with missing data (returns 0)
  it('should return 0 when custom range API returns no data', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
          periodEndUtc: '2026-04-20T12:00:00.000Z',
          units: 'in',
          rain: {
            '12h': 0,
            '24h': 0,
            '72h': 0,
            '168h': 0
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 0 } }) // No historical data
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 0 } }) // Modern format
      });

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374,
      sincePlantingDate: '2026-03-15',
      sinceLastSprayDate: '2026-04-01'
    });

    expect(result.sincePlanting).toBe(0);
    expect(result.sinceLastSpray).toBe(0);
  });

  // Test 13: Main API error handling
  it('should handle main API errors gracefully', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' })
    });

    await expect(RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374
    })).rejects.toThrow('RAIN_API_ERROR');
  });

  // Test 14: Field ID in API requests
  it('should include field_id in all API requests', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          location: { type: 'point', lat: 38.4627, lon: -93.5374, fieldId: mockFieldId },
          periodEndUtc: '2026-04-20T12:00:00.000Z',
          units: 'in',
          rain: {
            '12h': 0,
            '24h': 0,
            '72h': 0,
            '168h': 0
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 1.5 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rain: { total: 2.0 } })
      });

    await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: 38.4627,
      lng: -93.5374,
      sincePlantingDate: '2026-03-15',
      sinceLastSprayDate: '2026-04-01'
    });

    const calls = (fetch as any).mock.calls;
    expect(calls[0][0]).toContain(`field_id=${mockFieldId}`);
    expect(calls[1][0]).toContain(`field_id=${mockFieldId}`);
    expect(calls[2][0]).toContain(`field_id=${mockFieldId}`);
  });

  // Test 15: Real API integration test (if configured)
  it('should work with real Rain API when configured', async () => {
    const realApiUrl = import.meta.env.VITE_RAIN_API_URL;

    if (!realApiUrl || realApiUrl === 'https://api.example.com') {
      console.log('Skipping real API test - not configured');
      return;
    }

    console.log('Testing with real Rain API:', realApiUrl);

    try {
      const result = await RainService.fetchComprehensiveRainfall({
        fieldId: 'test-field',
        lat: 38.4627,
        lng: -93.5374,
        sincePlantingDate: '2026-03-15',
        sinceLastSprayDate: '2026-04-01'
      });

      console.log('Real API Result:', result);

      // Basic sanity checks
      expect(result).toHaveProperty('24h');
      expect(result).toHaveProperty('72h');
      expect(result).toHaveProperty('7d');
      expect(result).toHaveProperty('sincePlanting');
      expect(result).toHaveProperty('sinceLastSpray');
      expect(result).toHaveProperty('periodEndUtc');

      // Values should be numbers
      expect(typeof result['24h']).toBe('number');
      expect(typeof result.sincePlanting).toBe('number');
      expect(typeof result.sinceLastSpray).toBe('number');

    } catch (error) {
      console.error('Real API test failed:', error);
      throw error;
    }
  });
});