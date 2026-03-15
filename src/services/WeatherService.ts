import { WeatherData } from '../types/weather';

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // Link external signal to our controller
        if (signal) {
            signal.addEventListener('abort', () => controller.abort());
        }

        try {
            const url = `${VC_BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current&elements=windspeed,winddir,temp,humidity`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Weather API error: ${response.statusText}`);
            const data = await response.json();
            const current = data.currentConditions;
            
            return {
                windspeed: current?.windspeed ?? null,
                winddir: current?.winddir ?? null,
                windcardinal: current?.winddir != null ? this.degreesToDirection(current.winddir) : '—',
                temp: current?.temp ?? null,
                humidity: current?.humidity ?? null,
                isError: false
            };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[WeatherService] Fetch conditions timed out');
            } else {
                console.error('[WeatherService] Error fetching field conditions:', error);
            }
            return defaults;
        } finally {
            clearTimeout(timeoutId);
        }
    },

    /**
     * Fetches current weather data for the Weather Bar via Visual Crossing.
     * Including precip data for the last 24 and 72 hours.
     */
    async fetchCurrentWeather(location: string): Promise<WeatherData & { locationName?: string, isError?: boolean, precip24h?: number, precip72h?: number }> {
        if (!API_KEY || API_KEY === 'undefined') {
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Config Error', isError: true, precip24h: 0, precip72h: 0 };
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            // Fetch today + last 3 days to calculate accurate 24h/72h rainfall
            const url = `${VC_BASE_URL}/${location}/last3days?unitGroup=us&key=${API_KEY}&contentType=json&include=current,days&elements=temp,humidity,windspeed,winddir,precip`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Weather API error: ${response.statusText}`);
            const data = await response.json();
            const current = data.currentConditions;
            
            const days = data.days || [];
            // days usually returns newest to oldest or oldest to newest. Usually array is sorted by date ascending for timeline API
            // Let's sum precip from the days array.
            const today = new Date().toISOString().split('T')[0];
            
            let precip24h = 0;
            let precip72h = 0;
            
            if (days.length > 0) {
                // days typically includes the exact 3 historical dates + today depending on API nuances
                // Let's just sum the precip from the last 1 day (today or yesterday) vs last 3 days
                // Sort descending so days[0] is most recent just in case
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
        }
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
