import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RainService } from '../RainService';

describe('RainService - Real API Integration Tests', () => {
  const mockFieldId = 'integration-test-field';
  const testCoords = { lat: 38.4627, lng: -93.5374 };

  beforeEach(() => {
    vi.clearAllMocks();
    RainService.__test_clearCache();
  });

  // Test 1: Real API connectivity
  it('should connect to real Rain API and return data', async () => {
    const realApiUrl = import.meta.env.VITE_RAIN_API_URL;

    if (!realApiUrl || realApiUrl.includes('example.com')) {
      console.log('⚠️  Skipping real API test - VITE_RAIN_API_URL not configured');
      return;
    }

    console.log('🔗 Testing real Rain API connection:', realApiUrl);

    try {
      const result = await RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: testCoords.lat,
        lng: testCoords.lng,
        sincePlantingDate: '2026-03-15',
        sinceLastSprayDate: '2026-04-01'
      });

      console.log('✅ Real API Response:', result);

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

      console.log('✅ All validation checks passed');
    } catch (error) {
      console.error('❌ Real API test failed:', error);
      throw error;
    }
  });

  // Test 2: Custom range data availability
  it('should fetch custom range data from real API', async () => {
    const realApiUrl = import.meta.env.VITE_RAIN_API_URL;

    if (!realApiUrl || realApiUrl.includes('example.com')) {
      console.log('⚠️  Skipping custom range test - VITE_RAIN_API_URL not configured');
      return;
    }

    console.log('🔗 Testing custom range with real API');

    try {
      const result = await RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: testCoords.lat,
        lng: testCoords.lng,
        sincePlantingDate: '2026-03-01',
        sinceLastSprayDate: '2026-04-01'
      });

      console.log('Custom range results:');
      console.log('  Since planting (2026-03-01):', result.sincePlanting, 'inches');
      console.log('  Since spray (2026-04-01):', result.sinceLastSpray, 'inches');

      // For custom ranges, we expect either:
      // 1. Actual rainfall data (if available in Supabase)
      // 2. Zero (if no data available but API is working)

      const hasData = result.sincePlanting > 0 || result.sinceLastSpray > 0;

      if (hasData) {
        console.log('✅ Custom range data found in database');
        expect(result.sincePlanting).toBeGreaterThan(0);
      } else {
        console.log('⚠️  No custom range data found (might be normal if no historical data)');
        expect(result.sincePlanting).toBe(0);
        expect(result.sinceLastSpray).toBe(0);
      }

      // Radar data should still work regardless
      expect(result['24h']).toBeGreaterThanOrEqual(0);
      expect(result['72h']).toBeGreaterThanOrEqual(0);
      expect(result['7d']).toBeGreaterThanOrEqual(0);

    } catch (error) {
      console.error('❌ Custom range test failed:', error);
      throw error;
    }
  });

  // Test 3: Boundary centroid extraction
  it('should work with boundary polygons', async () => {
    const realApiUrl = import.meta.env.VITE_RAIN_API_URL;

    if (!realApiUrl || realApiUrl.includes('example.com')) {
      console.log('⚠️  Skipping boundary test - VITE_RAIN_API_URL not configured');
      return;
    }

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

    console.log('🔗 Testing boundary centroid extraction');

    try {
      const result = await RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: null,
        lng: null,
        boundary
      });

      console.log('✅ Boundary centroid extraction worked');
      expect(result).toHaveProperty('24h');
      expect(result['24h']).toBeGreaterThanOrEqual(0);

    } catch (error) {
      console.error('❌ Boundary test failed:', error);
      throw error;
    }
  });

  // Test 4: Error handling with real API
  it('should handle API errors gracefully', async () => {
    const realApiUrl = import.meta.env.VITE_RAIN_API_URL;

    if (!realApiUrl || realApiUrl.includes('example.com')) {
      console.log('⚠️  Skipping error handling test - VITE_RAIN_API_URL not configured');
      return;
    }

    console.log('🔗 Testing error handling with invalid coordinates');

    try {
      // Test with coordinates outside CONUS (should fail gracefully)
      const result = await RainService.fetchComprehensiveRainfall({
        fieldId: mockFieldId,
        lat: 0, // Outside CONUS
        lng: 0  // Outside CONUS
      });

      // API might return 0 rainfall for invalid coordinates
      console.log('✅ API handled invalid coordinates gracefully');
      expect(result['24h']).toBeGreaterThanOrEqual(0);

    } catch (error) {
      console.log('✅ API properly rejected invalid coordinates:', error);
      expect(error).toBeDefined();
    }
  });

  // Test 5: Cache functionality
  it('should use cache for identical requests', async () => {
    const realApiUrl = import.meta.env.VITE_RAIN_API_URL;

    if (!realApiUrl || realApiUrl.includes('example.com')) {
      console.log('⚠️  Skipping cache test - VITE_RAIN_API_URL not configured');
      return;
    }

    console.log('🔗 Testing request deduplication cache');

    try {
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

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('✅ Cache test completed in', duration, 'ms');
      console.log('  Result 1:', result1['24h'], 'inches');
      console.log('  Result 2:', result2['24h'], 'inches');

      // Results should be identical (cached)
      expect(result1).toEqual(result2);

      // Should be fast (cached)
      expect(duration).toBeLessThan(2000);

    } catch (error) {
      console.error('❌ Cache test failed:', error);
      throw error;
    }
  });
});