import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RainService } from '../RainService';
import { supabase } from '../../lib/supabase';

// Mock Supabase client
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}));

describe('RainService', () => {
  const mockFieldId = 'test-field-id';

  beforeEach(() => {
    vi.clearAllMocks();
    RainService.__test_clearCache();
  });

  it('should fetch rainfall data and return formatted RainData', async () => {
    // Mock successful RPC responses
    const mock24hData = [{ total_inches: 1.5 }];
    const mock72hData = [{ total_inches: 3.2 }];
    const mock7dData = [{ total_inches: 4.5 }];

    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: mock24hData, error: null }) // 24h call
      .mockResolvedValueOnce({ data: mock72hData, error: null }) // 72h call
      .mockResolvedValueOnce({ data: mock7dData, error: null }); // 7d call

    const result = await RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId });

    expect(supabase.rpc).toHaveBeenCalledTimes(3);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'get_rainfall_stats', expect.objectContaining({
      p_field_id: mockFieldId
    }));

    expect(result['24h']).toBe(1.5);
    expect(result['72h']).toBe(3.2);
    expect(result['7d']).toBe(4.5);
  });

  it('should handle zero rainfall correctly', async () => {
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ total_inches: 0 }], error: null })
      .mockResolvedValueOnce({ data: [{ total_inches: 0 }], error: null });

    const result = await RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId });

    expect(result['24h']).toBe(0);
    expect(result['72h']).toBe(0);
    expect(result['7d']).toBe(0);
  });

  it('should throw error when RPC fails', async () => {
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: null, error: { message: 'Database error' } })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId }))
      .rejects.toThrow('RPC_ERROR: UNKNOWN - Database error');
  });

  it('should deduplicate concurrent requests for the same field', async () => {
    const mockData = [{ total_inches: 1.0 }];
    // Mock a delay to simulate concurrent calls
    (supabase.rpc as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { data: mockData, error: null };
    });

    // Fire two requests concurrently
    const [res1, res2] = await Promise.all([
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId }),
      RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId })
    ]);

    // Should only call RPC three times because they share the same promise
    expect(supabase.rpc).toHaveBeenCalledTimes(3);
    expect(res1).toEqual(res2);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });

    controller.abort();

    await expect(RainService.fetchComprehensiveRainfall({ fieldId: mockFieldId, signal: controller.signal }))
      .rejects.toThrow('ABORTED');
  });

  it('should identify CONUS coordinates correctly', () => {
    // Inside CONUS
    expect(RainService.isWithinCONUS(39.0, -95.0)).toBe(true);
    // Outside CONUS (Alaska)
    expect(RainService.isWithinCONUS(64.0, -150.0)).toBe(false);
    // Outside CONUS (Europe)
    expect(RainService.isWithinCONUS(51.0, 0.0)).toBe(false);
  });
});
