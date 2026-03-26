import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('WeatherService', () => {
    const mockLocation = '40.7128,-74.0060';
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

    describe('fetchFieldConditions', () => {
        it('should return defaults if API_KEY is missing', async () => {
            vi.stubEnv('VITE_VISUALCROSSING_KEY', '');
            vi.resetModules();
            const { WeatherService } = await import('../WeatherService');
            
            const result = await WeatherService.fetchFieldConditions(40.7, -74.0);
            expect(result.isError).toBe(true);
            expect(result.windspeed).toBeNull();
        });

        it('should return defaults on fetch error (non-ok)', async () => {
            const { WeatherService } = await import('../WeatherService');
            (global.fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Unauthorized'
            });

            const result = await WeatherService.fetchFieldConditions(40.7, -74.0);
            expect(result.isError).toBe(true);
            expect(console.error).toHaveBeenCalled();
        });

        it('should return defaults on network error', async () => {
            const { WeatherService } = await import('../WeatherService');
            (global.fetch as any).mockRejectedValue(new Error('Network failure'));

            const result = await WeatherService.fetchFieldConditions(40.7, -74.0);
            expect(result.isError).toBe(true);
            expect(console.error).toHaveBeenCalled();
        });

        it('should handle AbortError (timeout)', async () => {
            const { WeatherService } = await import('../WeatherService');
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            (global.fetch as any).mockRejectedValue(abortError);

            const result = await WeatherService.fetchFieldConditions(40.7, -74.0);
            expect(result.isError).toBe(true);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
        });

        it('should use cached promise and handle its failure', async () => {
            const { WeatherService } = await import('../WeatherService');
            
            // First call to populate cache
            let resolver: any;
            const slowPromise = new Promise((resolve, reject) => {
                resolver = reject;
            });
            (global.fetch as any).mockReturnValue(slowPromise);

            const firstCall = WeatherService.fetchFieldConditions(40.7, -74.0);
            
            // Second call while first is in-flight
            const secondCall = WeatherService.fetchFieldConditions(40.7, -74.0);
            
            resolver(new Error('Cache fail'));
            
            const [res1, res2] = await Promise.all([firstCall, secondCall]);
            
            expect(res1.isError).toBe(true);
            expect(res2.isError).toBe(true);
        });
    });

    describe('fetchCurrentWeather', () => {
        it('should return Config Error if API_KEY is missing', async () => {
            vi.stubEnv('VITE_VISUALCROSSING_KEY', 'undefined');
            vi.resetModules();
            const { WeatherService } = await import('../WeatherService');
            
            const result = await WeatherService.fetchCurrentWeather('New York');
            expect(result.isError).toBe(true);
            expect(result.locationName).toBe('Config Error');
        });

        it('should return Unknown on fetch error', async () => {
            const { WeatherService } = await import('../WeatherService');
            (global.fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Forbidden'
            });

            const result = await WeatherService.fetchCurrentWeather('New York');
            expect(result.isError).toBe(true);
            expect(result.locationName).toBe('Unknown');
        });

        it('should handle cached promise failure in fetchCurrentWeather', async () => {
            const { WeatherService } = await import('../WeatherService');
            
            // Mock a pending promise
            let rejecter: any;
            const p = new Promise((_, reject) => { rejecter = reject; });
            (global.fetch as any).mockReturnValue(p);

            const call1 = WeatherService.fetchCurrentWeather('New York');
            const call2 = WeatherService.fetchCurrentWeather('New York');

            rejecter(new Error('Fail'));

            const [r1, r2] = await Promise.all([call1, call2]);
            expect(r1.isError).toBe(true);
            expect(r2.isError).toBe(true);
            expect(r2.locationName).toBe('Unknown');
        });

        it('should correctly map successful response', async () => {
            const { WeatherService } = await import('../WeatherService');
            const mockData = {
                address: 'New York',
                currentConditions: {
                    temp: 72.4,
                    humidity: 45,
                    windspeed: 10,
                    winddir: 180
                },
                days: [
                    { datetime: '2026-03-25', precip: 0.1 },
                    { datetime: '2026-03-24', precip: 0.2 },
                    { datetime: '2026-03-23', precip: 0.3 }
                ]
            };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const result = await WeatherService.fetchCurrentWeather('New York');
            expect(result.isError).toBe(false);
            expect(result.temp).toBe(72);
            expect(result.precip24h).toBe(0.1);
            expect(result.precip72h).toBe(0.6);
        });
    });
});
