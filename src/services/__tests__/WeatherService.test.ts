import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherService } from '../WeatherService';

describe('WeatherService', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        // The issue specifies 'getForecast', but the code only has fetchCurrentWeather and fetchFieldConditions.
        // It says "src/services/WeatherService.ts:56 Missing error test for non-OK response in getForecast",
        // wait, let's look at line 56.
        // Line 56 is exactly inside `fetchFieldConditions` in the source!
        // The issue likely misnamed it `getForecast` (a typo from whoever made the issue, but it points to line 56).
        // Let's test BOTH fetchFieldConditions and fetchCurrentWeather to be absolutely certain we covered it.
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('should handle non-OK response from fetchFieldConditions', async () => {
        // Mock fetch to return ok: false
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            statusText: 'Internal Server Error'
        } as unknown as Response);

        // Suppress console.error for clean test output
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await WeatherService.fetchFieldConditions(40.7128, -74.0060);

        expect(global.fetch).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            '[WeatherService] Error fetching field conditions:',
            expect.objectContaining({ message: 'Weather API error: Internal Server Error' })
        );

        expect(result).toEqual({
            windspeed: null,
            winddir: null,
            windcardinal: '—',
            temp: null,
            humidity: null,
            isError: true
        });
    });

    it('should handle non-OK response from fetchCurrentWeather', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            statusText: 'Service Unavailable'
        } as unknown as Response);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await WeatherService.fetchCurrentWeather('New York, NY');

        expect(global.fetch).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            '[WeatherService] Error fetching current weather:',
            expect.objectContaining({ message: 'Weather API error: Service Unavailable' })
        );

        expect(result).toEqual({
            temp: 0,
            humidity: 0,
            wind: 0,
            windDirection: '—',
            locationName: 'Unknown',
            isError: true,
            precip24h: 0,
            precip72h: 0
        });
    });
});
