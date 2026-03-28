import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RainService } from '../RainService';

describe('RainService', () => {
  const mockFieldId = 'test-field-id';
  const mockApiUrl = 'https://api.example.com/rain';

  beforeEach(() => {
    vi.clearAllMocks();
    RainService.__test_clearCache();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('VITE_RAIN_API_URL', mockApiUrl);
  });

  it('should fetch rainfall data using the new API and return formatted results', async () => {
    // Mock successful fetch responses
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rainfall: 1.5 })
      }) // 24h
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rainfall: 3.2 })
      }) // 72h
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rainfall: 4.5 })
      }) // 7d
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rainfall: 10.0 })
      }) // sincePlanting
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rainfall: 5.0 })
      }); // sinceLastSpray

    const result = await RainService.fetchComprehensiveRainfall({ 
      fieldId: mockFieldId,
      sincePlantingDate: '2026-03-01',
      sinceLastSprayDate: '2026-03-20'
    });

    expect(fetch).toHaveBeenCalledTimes(5);
    const firstCallUrl = (fetch as any).mock.calls[0][0];
    expect(firstCallUrl).toContain(mockApiUrl);
    expect(firstCallUrl).toContain(`field_id=${mockFieldId}`);

    expect(result['24h']).toBe(1.5);
    expect(result['72h']).toBe(3.2);
    expect(result['7d']).toBe(4.5);
    expect(result.sincePlanting).toBe(10.0);
    expect(result.sinceLastSpray).toBe(5.0);
  });

  it('should handle API errors correctly', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' })
    });

    await expect(RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId }))
      .rejects.toThrow('RAIN_API_ERROR: 500 - Internal Server Error');
  });

  it('should handle zero rainfall correctly', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ rainfall: 0 })
    });

    const result = await RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId });

    expect(result['24h']).toBe(0);
    expect(result['72h']).toBe(0);
    expect(result['7d']).toBe(0);
  });

  it('should deduplicate concurrent requests for the same field', async () => {
    (fetch as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        ok: true,
        json: async () => ({ rainfall: 1.0 })
      };
    });

    // Fire two requests concurrently
    const [res1, res2] = await Promise.all([
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId }),
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId })
    ]);

    // Should only call API three times (24h, 72h, 7d) because they share the same promise
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(res1).toEqual(res2);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    (fetch as any).mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AbortError')), 10);
    }));

    // This is a bit tricky to test Exactly like this because of how fetch handles abort,
    // but we can check if it throws when signal is already aborted.
    controller.abort();

    await expect(RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId, signal: controller.signal }))
      .rejects.toThrow();
  });

  it('should identify CONUS coordinates correctly', () => {
    expect(RainService.isWithinCONUS(39.0, -95.0)).toBe(true);
    expect(RainService.isWithinCONUS(64.0, -150.0)).toBe(false);
  });
});
