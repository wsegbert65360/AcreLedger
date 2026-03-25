import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../WeatherService', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual as any
    };
});

describe('WeatherService', () => {
    let WeatherService: any;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        global.fetch = vi.fn();

        // Mock import.meta.env
        vi.stubEnv('VITE_VISUALCROSSING_KEY', 'test-api-key');

        // Import after env is stubbed
        const mod = await import('../WeatherService');
        WeatherService = mod.WeatherService;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe('fetchFieldConditions', () => {
        const mockValidResponse = {
            currentConditions: {
                windspeed: 10,
                winddir: 180,
                temp: 75,
                humidity: 50
            }
        };

        it('should fetch field conditions successfully', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockValidResponse
            });

            const result = await WeatherService.fetchFieldConditions(40.7128, -74.0060);

            expect(result).toEqual({
                windspeed: 10,
                winddir: 180,
                windcardinal: 'S',
                temp: 75,
                humidity: 50,
                isError: false
            });
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should return defaults on network error', async () => {
            (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

            const result = await WeatherService.fetchFieldConditions(40.7128, -74.0060);

            expect(result).toEqual({
                windspeed: null,
                winddir: null,
                windcardinal: '—',
                temp: null,
                humidity: null,
                isError: true
            });
        });

        it('should handle in-flight request cache success', async () => {
            let resolveFetch: any;
            const fetchPromise = new Promise((resolve) => {
                resolveFetch = resolve;
            });

            (global.fetch as any).mockReturnValueOnce(fetchPromise);

            const promise1 = WeatherService.fetchFieldConditions(40.7128, -74.0060);
            const promise2 = WeatherService.fetchFieldConditions(40.7128, -74.0060);

            resolveFetch({
                ok: true,
                json: async () => mockValidResponse
            });

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).toEqual(result2);
            expect(result1.isError).toBe(false);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('should handle in-flight request cache rejection gracefully', async () => {
            let rejectFetch: any;
            const fetchPromise = new Promise((_, reject) => {
                rejectFetch = reject;
            });

            (global.fetch as any).mockReturnValueOnce(fetchPromise);

            const promise1 = WeatherService.fetchFieldConditions(40.7128, -74.0060);
            const promise2 = WeatherService.fetchFieldConditions(40.7128, -74.0060);

            rejectFetch(new Error('Network failure'));

            const [result1, result2] = await Promise.all([promise1, promise2]);

            const defaults = {
                windspeed: null,
                winddir: null,
                windcardinal: '—',
                temp: null,
                humidity: null,
                isError: true
            };

            expect(result1).toEqual(defaults);
            expect(result2).toEqual(defaults);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchCurrentWeather', () => {
        const mockCurrentResponse = {
            address: 'New York, NY',
            currentConditions: {
                temp: 72,
                humidity: 45,
                windspeed: 12,
                winddir: 90
            },
            days: [
                { datetime: '2023-10-03', precip: 0.5 },
                { datetime: '2023-10-02', precip: 1.2 },
                { datetime: '2023-10-01', precip: 0.3 }
            ]
        };

        it('should fetch current weather successfully', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockCurrentResponse
            });

            const result = await WeatherService.fetchCurrentWeather('40.7128,-74.0060');

            expect(result).toEqual({
                temp: 72,
                humidity: 45,
                wind: 12,
                windDirection: 'E',
                locationName: 'New York, NY',
                isError: false,
                precip24h: 0.5,
                precip72h: 2.0
            });
        });

        it('should return defaults on network error for fetchCurrentWeather', async () => {
            (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

            const result = await WeatherService.fetchCurrentWeather('40.7128,-74.0060');

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

        it('should handle in-flight request cache rejection for fetchCurrentWeather', async () => {
            let rejectFetch: any;
            const fetchPromise = new Promise((_, reject) => {
                rejectFetch = reject;
            });

            (global.fetch as any).mockReturnValueOnce(fetchPromise);

            const promise1 = WeatherService.fetchCurrentWeather('40.7128,-74.0060');
            const promise2 = WeatherService.fetchCurrentWeather('40.7128,-74.0060');

            rejectFetch(new Error('Network failure'));

            const [result1, result2] = await Promise.all([promise1, promise2]);

            const expectedDefaults = {
                temp: 0,
                humidity: 0,
                wind: 0,
                windDirection: '—',
                locationName: 'Unknown',
                isError: true,
                precip24h: 0,
                precip72h: 0
            };

            expect(result1).toEqual(expectedDefaults);
            expect(result2).toEqual(expectedDefaults);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
