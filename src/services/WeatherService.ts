import { WeatherData } from '../types/weather';

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

/**
 * Hardened Weather Service using Visual Crossing Timeline API.
 * Uses &unitGroup=us for inches/fahrenheit.
 */
export const WeatherService = {
    /**
     * Fetches the 24-hour precipitation total for a given location (lat, lng).
     * Specifically pulls the 'precip' field from the daily summary (days[0]).
     */
    async fetchRain24h(lat: number, lng: number): Promise<number> {
        const location = `${lat},${lng}`;
        return this.fetchRainByLocation(location);
    },

    /**
     * Internal helper for rainfall fetch via location string.
     */
    async fetchRainByLocation(location: string): Promise<number> {
        if (!API_KEY || API_KEY === 'undefined') {
            console.error('[WeatherService] API Key missing or invalid (VITE_VISUALCROSSING_KEY).');
            return 0;
        }
        if (!location || location.includes('undefined') || location.includes('NaN')) {
            console.warn('[WeatherService] Invalid location for rainfall fetch:', location);
            return 0;
        }

        try {
            const url = `${BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=days`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.statusText}`);
            }

            const data = await response.json();

            // Pulling precip from the daily summary (days[0]) for the current local day
            const precipValue = data.days?.[0]?.precip ?? 0;

            console.log(`[WeatherService] Raw Precip Value for ${location}: ${precipValue} inches`);

            return precipValue;
        } catch (error) {
            console.error('[WeatherService] Error fetching rainfall:', error);
            return 0;
        }
    },

    /**
     * Fetches current weather data (temp, humidity, wind) for the Weather Bar by location string (e.g. ZIP).
     */
    async fetchCurrentWeather(location: string): Promise<WeatherData & { locationName?: string }> {
        if (!API_KEY || API_KEY === 'undefined') {
            const isVercel = window.location.hostname.includes('vercel.app');
            const msg = isVercel
                ? '[WeatherService] API Key missing. Please add VITE_VISUALCROSSING_KEY to your Vercel Environment Variables.'
                : '[WeatherService] API Key missing or invalid (VITE_VISUALCROSSING_KEY).';
            console.error(msg);
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Config Error', isError: true };
        }
        if (!location || location.includes('undefined') || location.includes('NaN')) {
            console.warn('[WeatherService] Invalid location for current weather fetch:', location);
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Invalid Location', isError: true };
        }

        try {
            const url = `${BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.statusText}`);
            }

            const data = await response.json();
            const current = data.currentConditions;

            return {
                temp: Math.round(current.temp),
                humidity: Math.round(current.humidity),
                wind: Math.round(current.windspeed),
                windDirection: this.degreesToDirection(current.winddir),
                locationName: data.address // Visual Crossing returns the resolved address/location name
            };
        } catch (error) {
            console.error('[WeatherService] Error fetching current weather:', error);
            return {
                temp: 0,
                humidity: 0,
                wind: 0,
                windDirection: '—',
                locationName: 'Unknown',
                isError: true
            };
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
