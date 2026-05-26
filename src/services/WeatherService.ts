import { WeatherData, ExtendedWeatherData, ForecastDay } from '../types/weather';
import { supabase } from '@/lib/supabase';

// Use Vercel Serverless Function for weather proxy
const PROXY_URL = '/api/weather-proxy';

// Cache in-flight requests to deduplicate concurrent calls for the same location
const promiseCache = new Map<string, Promise<any>>();
const extendedCache = new Map<string, Promise<any>>();

/**
 * Hardened Weather Service.
 * Fetches real-time conditions and historical rainfall via Supabase Proxy.
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
        const location = encodeURIComponent(`${lat},${lng}`);
        // Default values for safety/error cases
        const defaults = { windspeed: null, winddir: null, windcardinal: '—', temp: null, humidity: null, isError: true };

        // If a request for this location is already in-flight, return the shared promise
        if (promiseCache.has(location)) {
            try {
                const data = await promiseCache.get(location);
                return this._mapFieldConditions(data);
            } catch (_error) {
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
            const url = `${PROXY_URL}?location=${location}&endpoint=today&unitGroup=us&contentType=json&include=current&elements=windspeed,winddir,temp,humidity`;
            
            const fetchPromise = supabase.auth.getSession().then(({ data: { session } }) => 
                fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                })
            ).then(res => {
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
        const encLocation = encodeURIComponent(location);
        if (promiseCache.has(encLocation)) {
            try {
                const data = await promiseCache.get(encLocation);
                return this._mapCurrentWeather(data);
            } catch (_error) {
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
            const url = `${PROXY_URL}?location=${encLocation}&endpoint=last3days/today&unitGroup=us&contentType=json&include=current,days&elements=datetime,temp,humidity,windspeed,winddir,precip,precipprob`;
            
            const fetchPromise = supabase.auth.getSession().then(({ data: { session } }) =>
                fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                })
            ).then(res => {
                if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
                return res.json();
            });
                
            promiseCache.set(encLocation, fetchPromise);
            
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
            promiseCache.delete(encLocation);
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
            cloudCover: 0, conditions: '', icon: 'clear-day',
            sunrise: '', sunset: '',
            isError: true, forecastDays: [],
        };

        const encLocation = encodeURIComponent(location);
        if (extendedCache.has(encLocation)) {
            try {
                const data = await extendedCache.get(encLocation);
                return this._mapExtendedWeather(data, location);
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
                `${PROXY_URL}?location=${encLocation}&endpoint=last7days/next10days`,
                `&unitGroup=us&contentType=json`,
                `&include=current,days`,
                `&elements=datetime,tempmax,tempmin,temp,feelslike,humidity,dew,windspeed,windgusts,winddir,precip,precipprob,cloudcover,conditions,icon,sunrise,sunset`,
            ].join('');

            const fetchPromise = supabase.auth.getSession().then(({ data: { session } }) =>
                fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                })
            ).then(res => {
                if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
                return res.json();
            });

            extendedCache.set(encLocation, fetchPromise);
            const data = await fetchPromise;
            return this._mapExtendedWeather(data, location);
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
            extendedCache.delete(encLocation);
        }
    },

    _mapExtendedWeather(data: any, location: string): ExtendedWeatherData {
        const current = data.currentConditions;
        if (!current) {
            return {
                temp: 0, feelsLike: 0, humidity: 0, wind: 0, gusts: 0,
                windDirection: '—', dewPoint: 0, precipProb: 0,
                precip24h: 0, precip72h: 0, precip168h: 0,
                isRainingNow: false, locationName: data.address || location || 'Unknown',
                cloudCover: 0, conditions: '', icon: 'clear-day',
                sunrise: '', sunset: '',
                isError: true, forecastDays: [],
            };
        }

        const days: any[] = data.days || [];
        // Use local date, not UTC — avoids filtering out forecast at night (e.g. 8pm CDT = 1am UTC next day)
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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
                conditions: d.conditions || undefined,
                icon: d.icon || undefined,
                cloudCover: d.cloudcover != null ? Math.round(d.cloudcover) : undefined,
                windSpeed: d.windspeed != null ? Math.round(d.windspeed) : undefined,
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
            cloudCover: Math.round(current.cloudcover ?? 0),
            conditions: current.conditions || '',
            icon: current.icon || 'clear-day',
            sunrise: current.sunrise ? (current.sunrise as string).slice(0, 5) : '',
            sunset: current.sunset ? (current.sunset as string).slice(0, 5) : '',
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            // Format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
            const dateTime = timeStr ? `${dateStr}T${timeStr}:00` : dateStr;
            const location = encodeURIComponent(`${lat},${lng}`);
            const url = `${PROXY_URL}?location=${location}&endpoint=${dateTime}&unitGroup=us&contentType=json&include=hours,current&elements=temp,humidity,windspeed,winddir`;

            const res = await supabase.auth.getSession().then(({ data: { session } }) =>
                fetch(url, { 
                    signal: controller.signal,
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                })
            );
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
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[WeatherService] Historical weather fetch timed out');
            } else {
                console.error('[WeatherService] Error fetching historical weather:', error);
            }
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }
};
