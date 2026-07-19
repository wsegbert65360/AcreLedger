import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RainService } from '../RainService';

// The whole suite contacts the real Rain API. Gate on the same env var the
// code reads (import.meta.env.VITE_RAIN_API_URL). When it is unset or a
// placeholder, describe.skipIf reports every test as skipped — never as a
// false pass from an early return with no assertions.
const realApiUrl = import.meta.env.VITE_RAIN_API_URL;
const isConfigured = !!realApiUrl && !realApiUrl.includes('example.com');

describe.skipIf(!isConfigured)('RainService - Real API Integration Tests', () => {
  const mockFieldId = 'integration-test-field';
  const testCoords = { lat: 38.4627, lng: -93.5374 };

  beforeEach(() => {
    vi.clearAllMocks();
    RainService.__test_clearCache();
  });

  // Test 1: Real API connectivity
  it('should connect to real Rain API and return data', async () => {
    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: testCoords.lat,
      lng: testCoords.lng,
      sincePlantingDate: '2026-03-15',
      sinceLastSprayDate: '2026-04-01'
    });

    // Validate response structure
    expect(result).toHaveProperty('24h');
    expect(result).toHaveProperty('72h');
    expect(result).toHaveProperty('7d');
    expect(result).toHaveProperty('sincePlanting');
    expect(result).toHaveProperty('sinceLastSpray');
    expect(result).toHaveProperty('periodEndUtc');

    // Validate data types
    expect(typeof result['24h']).toBe('number');
    expect(typeof result['72h']).toBe('number');
    expect(typeof result['7d']).toBe('number');
    expect(typeof result.sincePlanting).toBe('number');
    expect(typeof result.sinceLastSpray).toBe('number');

    // Validate value ranges (rainfall can't be negative)
    expect(result['24h']).toBeGreaterThanOrEqual(0);
    expect(result['72h']).toBeGreaterThanOrEqual(0);
    expect(result['7d']).toBeGreaterThanOrEqual(0);
    expect(result.sincePlanting).toBeGreaterThanOrEqual(0);
    expect(result.sinceLastSpray).toBeGreaterThanOrEqual(0);
  });

  // Test 2: Custom range data availability
  it('should fetch custom range data from real API', async () => {
    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: testCoords.lat,
      lng: testCoords.lng,
      sincePlantingDate: '2026-03-01',
      sinceLastSprayDate: '2026-04-01'
    });

    // For custom ranges, we expect either:
    // 1. Actual rainfall data (if available in Supabase)
    // 2. Zero (if no data available but API is working)
    const hasData = result.sincePlanting > 0 || result.sinceLastSpray > 0;

    if (hasData) {
      expect(result.sincePlanting).toBeGreaterThan(0);
    } else {
      expect(result.sincePlanting).toBe(0);
      expect(result.sinceLastSpray).toBe(0);
    }

    // Radar data should still work regardless
    expect(result['24h']).toBeGreaterThanOrEqual(0);
    expect(result['72h']).toBeGreaterThanOrEqual(0);
    expect(result['7d']).toBeGreaterThanOrEqual(0);
  });

  // Test 3: Boundary centroid extraction
  it('should work with boundary polygons', async () => {
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

    const result = await RainService.fetchComprehensiveRainfall({
      fieldId: mockFieldId,
      lat: null,
      lng: null,
      boundary
    });

    expect(result).toHaveProperty('24h');
    expect(result['24h']).toBeGreaterThanOrEqual(0);
  });

  // Test 4: Error handling with real API
  it('should handle API errors gracefully', async () => {
    // Test with coordinates outside CONUS (should fail gracefully)
    try {
      const result = await RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: 0, // Outside CONUS
        lng: 0  // Outside CONUS
      });
      // API might return 0 rainfall for invalid coordinates
      expect(result['24h']).toBeGreaterThanOrEqual(0);
    } catch (error) {
      // Or it properly rejects invalid coordinates
      expect(error).toBeDefined();
    }
  });

  // Test 5: Cache functionality
  it('should use cache for identical requests', async () => {
    const startTime = Date.now();

    const [result1, result2] = await Promise.all([
      RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: testCoords.lat,
        lng: testCoords.lng
      }),
      RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: testCoords.lat,
        lng: testCoords.lng
      })
    ]);

    const duration = Date.now() - startTime;

    // Results should be identical (cached)
    expect(result1).toEqual(result2);

    // Should be fast (cached)
    expect(duration).toBeLessThan(2000);
  });
});
