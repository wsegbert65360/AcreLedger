import { WeatherData, ExtendedWeatherData, ForecastDay } from '../types/weather';

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

// Cache in-flight requests to deduplicate concurrent calls for the same location
const promiseCache = new Map<string, Promise<any>>();
const extendedCache = new Map<string, Promise<any>>();

/**
 * Hardened Weather Service.
 * Fetches real-time conditions and historical rainfall via Visual Crossing.
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
        let abortListener: (() => void) | undefined;
        
        if (signal) {
            abortListener = () => controller.abort();
            signal.addEventListener('abort', abortListener);
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
            if (abortListener && signal) signal.removeEventListener('abort', abortListener);
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
    async fetchCurrentWeather(location: string, signal?: AbortSignal): Promise<WeatherData & { locationName?: string, isError?: boolean, precip24h?: number, precip72h?: number, precipProb?: number }> {
        if (!API_KEY || API_KEY === 'undefined') {
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Config Error', isError: true, precip24h: 0, precip72h: 0, precipProb: 0 };
        }

        if (promiseCache.has(location)) {
            try {
                const data = await promiseCache.get(location);
                return this._mapCurrentWeather(data);
            } catch (error) {
                return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Unknown', isError: true, precip24h: 0, precip72h: 0, precipProb: 0 };
            }
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        let abortListener: (() => void) | undefined;
        
        if (signal) {
            abortListener = () => controller.abort();
            signal.addEventListener('abort', abortListener);
        }

        try {
            // Fetch today + last 3 days to calculate accurate 24h/72h rainfall along with current conditions
            const url = `${VC_BASE_URL}/${location}/last3days/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current,days&elements=datetime,temp,humidity,windspeed,winddir,precip,precipprob`;
            
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
                temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Unknown', isError: true, precip24h: 0, precip72h: 0, precipProb: 0
            };
        } finally {
            clearTimeout(timeoutId);
            if (abortListener && signal) signal.removeEventListener('abort', abortListener);
            promiseCache.delete(location);
        }
    },

    _mapCurrentWeather(data: any) {
        const current = data.currentConditions;
        if (!current) {
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: data.address || 'Unknown', isError: true, precip24h: 0, precip72h: 0, precipProb: 0 };
        }
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
            precip72h: Math.round(precip72h * 100) / 100,
            precipProb: Math.round(current.precipprob || 0)
        };
    },

    /**
     * Fetches extended weather data for the Weather Detail page.
     * Includes current conditions, 7-day rainfall history, and 10-day forecast.
     */
    async fetchExtendedWeather(location: string, signal?: AbortSignal): Promise<ExtendedWeatherData> {
        const defaults: ExtendedWeatherData = {
            temp: 0, feelsLike: 0, humidity: 0, wind: 0, gusts: 0,
            windDirection: '—', dewPoint: 0, precipProb: 0,
            precip24h: 0, precip72h: 0, precip168h: 0,
            isRainingNow: false, locationName: 'Unknown',
            latitude: null, longitude: null, isError: true, forecastDays: [],
        };

        if (!API_KEY || API_KEY === 'undefined') {
            return { ...defaults, locationName: 'Config Error' };
        }

        if (extendedCache.has(location)) {
            try {
                return await extendedCache.get(location);
            } catch {
                // fall through and retry
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let abortListener: (() => void) | undefined;

        if (signal) {
            abortListener = () => controller.abort();
            signal.addEventListener('abort', abortListener);
        }

        try {
            const url = [
                `${VC_BASE_URL}/${encodeURIComponent(location)}/last7days`,
                `?unitGroup=us&key=${API_KEY}&contentType=json`,
                `&include=current,days`,
                `&elements=temp,feelslike,humidity,dew,windspeed,windgusts,winddir,precip,precipprob,cloudcover`,
                `&forecastDays=10`,
            ].join('');

            const fetchPromise = fetch(url, { signal: controller.signal })
                .then(res => {
                    if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
                    return res.json();
                });

            extendedCache.set(location, fetchPromise);
            const data = await fetchPromise;
            return this._mapExtendedWeather(data);
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[WeatherService] Extended weather fetch timed out');
            } else {
                console.error('[WeatherService] Error fetching extended weather:', error);
            }
            return defaults;
        } finally {
            clearTimeout(timeoutId);
            if (abortListener && signal) signal.removeEventListener('abort', abortListener);
            extendedCache.delete(location);
        }
    },

    _mapExtendedWeather(data: any): ExtendedWeatherData {
        const current = data.currentConditions;
        if (!current) {
            return {
                temp: 0, feelsLike: 0, humidity: 0, wind: 0, gusts: 0,
                windDirection: '—', dewPoint: 0, precipProb: 0,
                precip24h: 0, precip72h: 0, precip168h: 0,
                isRainingNow: false, locationName: data.address || 'Unknown',
                latitude: data.latitude ?? null, longitude: data.longitude ?? null,
                isError: true, forecastDays: [],
            };
        }

        const days: any[] = data.days || [];
        const todayStr = new Date().toISOString().split('T')[0];

        // Historical days for rainfall (up to and including today)
        const pastDays = [...days]
            .filter(d => d.datetime <= todayStr)
            .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

        const precip24h = pastDays[0]?.precip || 0;
        const precip72h = pastDays.slice(0, 3).reduce((sum, d) => sum + (d.precip || 0), 0);
        const precip168h = pastDays.slice(0, 7).reduce((sum, d) => sum + (d.precip || 0), 0);

        // Forecast days (today + future, up to 10)
        const forecastDays: ForecastDay[] = days
            .filter(d => d.datetime >= todayStr)
            .slice(0, 10)
            .map(d => ({
                date: d.datetime,
                tempHighF: d.tempmax != null ? Math.round(d.tempmax) : null,
                tempLowF: d.tempmin != null ? Math.round(d.tempmin) : null,
                rainChance: d.precipprob != null ? Math.round(d.precipprob) : null,
                precipIn: d.precip != null ? Math.round(d.precip * 100) / 100 : null,
            }));

        return {
            temp: Math.round(current.temp),
            feelsLike: Math.round(current.feelslike ?? current.temp),
            humidity: Math.round(current.humidity),
            wind: Math.round(current.windspeed),
            gusts: Math.round(current.windgusts ?? current.windspeed),
            windDirection: current.winddir != null ? this.degreesToDirection(current.winddir) : '—',
            dewPoint: Math.round(current.dew ?? 0),
            precipProb: Math.round(current.precipprob || 0),
            precip24h: Math.round(precip24h * 100) / 100,
            precip72h: Math.round(precip72h * 100) / 100,
            precip168h: Math.round(precip168h * 100) / 100,
            isRainingNow: (current.precip || 0) > 0,
            locationName: data.address || 'Unknown',
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            isError: false,
            forecastDays,
        };
    },

    /**
     * Helper to convert degrees to cardinal direction.
     */
    degreesToDirection(deg: number): string {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const idx = Math.round(deg / 22.5) % 16;
        return directions[idx];
    },

    /**
     * Fetches historical conditions for a specific location and timestamp.
     * Useful for recovering missing weather data in old records.
     */
    async fetchHistoricalConditions(lat: number, lng: number, dateStr: string, timeStr?: string): Promise<WeatherData | null> {
        if (!API_KEY || API_KEY === 'undefined') return null;

        try {
            // Format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
            const dateTime = timeStr ? `${dateStr}T${timeStr}:00` : dateStr;
            const url = `${VC_BASE_URL}/${lat},${lng}/${dateTime}?unitGroup=us&key=${API_KEY}&contentType=json&include=hours,current&elements=temp,humidity,windspeed,winddir`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Historical weather fetch failed');
            
            const data = await res.json();
            
            // If we provided a specific time, the 'currentConditions' in the response 
            // will reflect that specific moment in the timeline API.
            const target = data.currentConditions || data.days?.[0];
            if (!target) return null;

            return {
                temp: Math.round(target.temp),
                humidity: Math.round(target.humidity),
                wind: Math.round(target.windspeed),
                windDirection: this.degreesToDirection(target.winddir)
            };
        } catch (error) {
            console.error('[WeatherService] Error fetching historical weather:', error);
            return null;
        }
    }
};
