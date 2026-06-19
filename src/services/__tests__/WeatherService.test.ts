import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('WeatherService', () => {
    const mockApiKey = 'test-api-key';

    beforeEach(() => {
        vi.stubEnv('VITE_VISUALCROSSING_KEY', mockApiKey);
        vi.clearAllMocks();
        vi.resetModules();
        global.fetch = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => {});

        // Mock supabase session
        vi.mock('@/lib/supabase', () => ({
            supabase: {
                auth: {
                    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } })
                }
            }
        }));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unmock('@/lib/supabase');
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
            const slowPromise = new Promise((_, reject) => {
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
        it('should return Unknown if fetch fails', async () => {
            const { WeatherService } = await import('../WeatherService');
            (global.fetch as any).mockRejectedValue(new Error('Fetch failed'));
            
            const result = await WeatherService.fetchCurrentWeather('New York');
            expect(result.isError).toBe(true);
            expect(result.locationName).toBe('Unknown');
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
            expect((global.fetch as any).mock.calls[0][0]).toContain('weather.visualcrossing.com');
            expect((global.fetch as any).mock.calls[0][0]).toContain('key=test-api-key');
        });
    });

    describe('fetchExtendedWeather', () => {
        it('should correctly map successful extended weather response including coordinates', async () => {
            const { WeatherService } = await import('../WeatherService');
            const mockData = {
                address: 'New York',
                latitude: 40.7128,
                longitude: -74.0060,
                currentConditions: {
                    temp: 72.4,
                    feelslike: 71.2,
                    humidity: 45,
                    windspeed: 10,
                    windgusts: 15,
                    winddir: 180,
                    dew: 50.5,
                    precipprob: 20,
                    precip: 0,
                    cloudcover: 10,
                    conditions: 'Partly Cloudy',
                    icon: 'partly-cloudy-day',
                    sunrise: '05:30:00',
                    sunset: '20:15:00'
                },
                days: [
                    {
                        datetime: new Date().toISOString().split('T')[0],
                        tempmax: 80,
                        tempmin: 60,
                        precipprob: 30,
                        precip: 0.05,
                        conditions: 'Partly Cloudy',
                        icon: 'partly-cloudy-day',
                        cloudcover: 25,
                        windspeed: 12
                    }
                ]
            };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const result = await WeatherService.fetchExtendedWeather('New York');
            expect(result.isError).toBe(false);
            expect(result.temp).toBe(72);
            expect(result.feelsLike).toBe(71);
            expect(result.latitude).toBe(40.7128);
            expect(result.longitude).toBe(-74.0060);
            expect(result.forecastDays.length).toBe(1);
            expect(result.forecastDays[0].tempHighF).toBe(80);
            expect(result.forecastDays[0].tempLowF).toBe(60);
        });
    });
});
