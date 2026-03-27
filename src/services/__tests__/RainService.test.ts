import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RainService } from '../RainService';

describe('RainService', () => {
  const mockLat = 40.7128;
  const mockLng = -74.0060;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.stubEnv('VITE_VISUALCROSSING_KEY', mockApiKey);
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should fetch rainfall data and calculate correct totals', async () => {
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    const currentEpoch = Math.floor(Date.now() / 1000);
    const mockData = {
      days: [
        {
          datetime: '2023-10-01',
          hours: [
            // Inside 24h
            { datetimeEpoch: currentEpoch - 3600, precip: 0.5 },
            // Inside 72h, outside 24h
            { datetimeEpoch: currentEpoch - 48 * 3600, precip: 1.0 },
            // Inside 7d, outside 72h
            { datetimeEpoch: currentEpoch - 4 * 24 * 3600, precip: 0.5 },
            // Outside 7d
            { datetimeEpoch: currentEpoch - 8 * 24 * 3600, precip: 2.0 }
          ]
        }
      ]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    const result = await RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    expect(result['24h']).toBe(0.5);
    expect(result['72h']).toBe(1.5);
    expect(result['7d']).toBe(2.0);
    expect(result.sincePlanting).toBe(0);
    expect(result.sinceLastSpray).toBe(0);
  });

  it('should calculate sincePlanting and sinceLastSpray correctly', async () => {
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    const currentEpoch = Math.floor(Date.now() / 1000);
    const plantingDate = new Date(currentEpoch * 1000 - 10 * 24 * 3600 * 1000).toISOString();
    const sprayDate = new Date(currentEpoch * 1000 - 5 * 24 * 3600 * 1000).toISOString();

    const mockData = {
      days: [
        {
          hours: [
            // After spray and planting
            { datetimeEpoch: currentEpoch - 2 * 24 * 3600, precip: 1.0 },
            // Between planting and spray
            { datetimeEpoch: currentEpoch - 7 * 24 * 3600, precip: 2.0 },
            // Before planting
            { datetimeEpoch: currentEpoch - 12 * 24 * 3600, precip: 3.0 }
          ]
        }
      ]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    const result = await RainService.fetchComprehensiveRainfall({
        lat: mockLat,
        lng: mockLng,
        sincePlantingDate: plantingDate,
        sinceLastSprayDate: sprayDate
    });

    // sincePlanting: 1.0 + 2.0 = 3.0
    expect(result.sincePlanting).toBe(3.0);
    // sinceLastSpray: 1.0
    expect(result.sinceLastSpray).toBe(1.0);
  });

  it('should handle zero rainfall correctly', async () => {
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ days: [] })
    });

    const result = await RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng });

    expect(result['24h']).toBe(0);
    expect(result['72h']).toBe(0);
    expect(result['7d']).toBe(0);
  });

  it('should throw error when fetch fails', async () => {
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    (global.fetch as any).mockResolvedValue({
      ok: false,
      statusText: 'Forbidden'
    });

    await expect(RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng }))
      .rejects.toThrow('Weather API error: Forbidden');
  });

  it('should deduplicate concurrent requests for the same location', async () => {
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    const currentEpoch = Math.floor(Date.now() / 1000);
    const mockData = {
      days: [
        {
          hours: [
            { datetimeEpoch: currentEpoch - 3600, precip: 1.0 }
          ]
        }
      ]
    };

    // Mock a delay to simulate concurrent calls
    (global.fetch as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { ok: true, json: async () => mockData };
    });

    // Fire two requests concurrently
    const [res1, res2] = await Promise.all([
      RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng }),
      RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng })
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res1).toEqual(res2);
  });

  it('should respect abort signal', async () => {
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    const controller = new AbortController();

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as any).mockRejectedValue(abortError);

    controller.abort();

    await expect(RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng, signal: controller.signal }))
      .rejects.toThrow('The operation was aborted');
  });

  it('should throw error if API key is missing', async () => {
    vi.stubEnv('VITE_VISUALCROSSING_KEY', '');
    vi.resetModules();
    const { RainService } = await import('../RainService');
    RainService.__test_clearCache();

    await expect(RainService.fetchComprehensiveRainfall({ lat: mockLat, lng: mockLng }))
      .rejects.toThrow('Visual Crossing API key is missing');
  });

  it('should identify CONUS coordinates correctly', async () => {
    const { RainService } = await import('../RainService');

    // Inside CONUS
    expect(RainService.isWithinCONUS(39.0, -95.0)).toBe(true);
    // Outside CONUS (Alaska)
    expect(RainService.isWithinCONUS(64.0, -150.0)).toBe(false);
    // Outside CONUS (Europe)
    expect(RainService.isWithinCONUS(51.0, 0.0)).toBe(false);
  });
});
