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
  });

  it('should fetch rainfall data and return formatted RainData', async () => {
    // Mock successful RPC responses
    const mock24hData = [{ total_inches: 1.5 }];
    const mock72hData = [{ total_inches: 3.2 }];

    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: mock24hData, error: null }) // 24h call
      .mockResolvedValueOnce({ data: mock72hData, error: null }); // 72h call

    const result = await RainService.fetchRainfall({ fieldId: mockFieldId });

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'get_rainfall_stats', expect.objectContaining({
      p_field_id: mockFieldId
    }));

    expect(result.rain['24h']).toBe(1.5);
    expect(result.rain['72h']).toBe(3.2);
    expect(result.rain['12h']).toBe(0.75); // 1.5 * 0.5 approximation
    expect(result.units).toBe('in');
  });

  it('should handle zero rainfall correctly', async () => {
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ total_inches: 0 }], error: null });

    const result = await RainService.fetchRainfall({ fieldId: mockFieldId });

    expect(result.rain['24h']).toBe(0);
    expect(result.rain['72h']).toBe(0);
  });

  it('should throw error when RPC fails', async () => {
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: null, error: { message: 'Database error' } })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(RainService.fetchRainfall({ fieldId: mockFieldId }))
      .rejects.toThrow('RPC_ERROR: UNKNOWN - Database error');
  });

  it('should throw error when 72h RPC fails and include code', async () => {
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [{ total_inches: 1.0 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '500', message: 'Timeout' } });

    await expect(RainService.fetchRainfall({ fieldId: mockFieldId }))
      .rejects.toThrow('RPC_ERROR: 500 - Timeout');
  });

  it('should warn and handle when 24h data is missing but 72h data exists', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ total_inches: 1.0 }], error: null });

    const result = await RainService.fetchRainfall({ fieldId: mockFieldId });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `[RainService] No rainfall data returned for field ${mockFieldId}. Check if records are finalized.`
    );
    expect(result.rain['24h']).toBe(0);
    expect(result.rain['72h']).toBe(1.0);

    consoleWarnSpy.mockRestore();
  });

  it('should warn and handle when 72h data is missing but 24h data exists', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [{ total_inches: 1.5 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await RainService.fetchRainfall({ fieldId: mockFieldId });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `[RainService] No rainfall data returned for field ${mockFieldId}. Check if records are finalized.`
    );
    expect(result.rain['24h']).toBe(1.5);
    expect(result.rain['72h']).toBe(0);

    consoleWarnSpy.mockRestore();
  });

  it('should handle missing expected fields (contract test)', async () => {
    // Mock successful response but with missing total_inches field
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [{ wrong_field: 0.5 }], error: null })
      .mockResolvedValueOnce({ data: [{ total_inches: 1.0 }], error: null });

    const result = await RainService.fetchRainfall({ fieldId: mockFieldId });

    // Should default to 0 for the missing field
    expect(result.rain['24h']).toBe(0);
    expect(result.rain['72h']).toBe(1.0);
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
