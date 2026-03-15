import { WeatherData } from '../types/weather';

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

// Cache in-flight requests to deduplicate concurrent calls for the same location
const promiseCache = new Map<string, Promise<any>>();

/**
 * Hardened Weather Service.
 * Rainfall now provided by local NOAA MRMS service.
 * Wind/Temp still provided by Visual Crossing for real-time conditions.
 */
export const WeatherService = {
    /**
     * Fetches current wind/temp for a specific field location via Visual Crossing.
     * Returns windspeed, cardinal direction, raw direction, temp, and humidity.
     */
    async fetchFieldConditions(lat: number, lng: number, signal?: AbortSignal): Promise<{ 
        windspeed: number | null; 
        winddir: number | null;
        windcardinal: string;
        temp: number | null;
        humidity: number | null;
        isError?: boolean;
    }> {
        const location = `${lat},${lng}`;
        // Default values for safety/error cases
        const defaults = { windspeed: null, winddir: null, windcardinal: '—', temp: null, humidity: null, isError: true };
        
        if (!API_KEY || API_KEY === 'undefined') return defaults;

        // If a request for this location is already in-flight, return the shared promise
        if (promiseCache.has(location)) {
            try {
                const data = await promiseCache.get(location);
                return this._mapFieldConditions(data);
            } catch (error) {
                // If the cached promise fails, we fall through and try again or return defaults
                return defaults;
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // Link external signal to our controller
        if (signal) {
            signal.addEventListener('abort', () => controller.abort());
        }

        try {
            const url = `${VC_BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current&elements=windspeed,winddir,temp,humidity`;
            
            const fetchPromise = fetch(url, { signal: controller.signal })
                .then(res => {
                    if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
                    return res.json();
                });

            // Store the promise in the cache
            promiseCache.set(location, fetchPromise);

            const data = await fetchPromise;
            return this._mapFieldConditions(data);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[WeatherService] Fetch conditions timed out');
            } else {
                console.error('[WeatherService] Error fetching field conditions:', error);
            }
            return defaults;
        } finally {
            clearTimeout(timeoutId);
            // Remove from cache after completion so subsequent requests fetch fresh
            promiseCache.delete(location);
        }
    },

    /**
     * Helper to map Visual Crossing timeline API response to our custom format.
     */
    _mapFieldConditions(data: any): { windspeed: number | null; winddir: number | null; windcardinal: string; temp: number | null; humidity: number | null; isError: boolean; } {
        const current = data.currentConditions;
        return {
            windspeed: current?.windspeed ?? null,
            winddir: current?.winddir ?? null,
            windcardinal: current?.winddir != null ? this.degreesToDirection(current.winddir) : '—',
            temp: current?.temp ?? null,
            humidity: current?.humidity ?? null,
            isError: false
        };
    },

    /**
     * Fetches current weather data for the Weather Bar via Visual Crossing.
     * Including precip data for the last 24 and 72 hours.
     */
    async fetchCurrentWeather(location: string): Promise<WeatherData & { locationName?: string, isError?: boolean, precip24h?: number, precip72h?: number }> {
        if (!API_KEY || API_KEY === 'undefined') {
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Config Error', isError: true, precip24h: 0, precip72h: 0 };
        }

        if (promiseCache.has(location)) {
            try {
                const data = await promiseCache.get(location);
                return this._mapCurrentWeather(data);
            } catch (error) {
                return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Unknown', isError: true, precip24h: 0, precip72h: 0 };
            }
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            // Fetch today + last 3 days to calculate accurate 24h/72h rainfall along with current conditions
            const url = `${VC_BASE_URL}/${location}/last3days/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current,days&elements=datetime,temp,humidity,windspeed,winddir,precip`;
            
            const fetchPromise = fetch(url, { signal: controller.signal })
                .then(res => {
                    if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
                    return res.json();
                });
                
            promiseCache.set(location, fetchPromise);
            
            const data = await fetchPromise;
            return this._mapCurrentWeather(data);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[WeatherService] Fetch current weather timed out');
            } else {
                console.error('[WeatherService] Error fetching current weather:', error);
            }
            return {
                temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Unknown', isError: true, precip24h: 0, precip72h: 0
            };
        } finally {
            clearTimeout(timeoutId);
            promiseCache.delete(location);
        }
    },

    _mapCurrentWeather(data: any) {
        const current = data.currentConditions;
        const days = data.days || [];
        
        let precip24h = 0;
        let precip72h = 0;
        
        if (days.length > 0) {
            const sortedDays = [...days].sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
            precip24h = sortedDays[0]?.precip || 0;
            precip72h = sortedDays.slice(0, 3).reduce((sum, day) => sum + (day.precip || 0), 0);
        }

        return {
            temp: Math.round(current.temp),
            humidity: Math.round(current.humidity),
            wind: Math.round(current.windspeed),
            windDirection: this.degreesToDirection(current.winddir),
            locationName: data.address,
            isError: false,
            precip24h: Math.round(precip24h * 100) / 100,
            precip72h: Math.round(precip72h * 100) / 100
        };
    },

    /**
     * Helper to convert degrees to cardinal direction.
     */
    degreesToDirection(deg: number): string {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const idx = Math.round(deg / 22.5) % 16;
        return directions[idx];
    }
};
