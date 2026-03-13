import { WeatherData } from '../types/weather';

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';
import { supabase } from '@/lib/supabase';

export interface RainfallStats {
    today_in: number;
    yesterday_in: number;
    last_7_days_in: number;
    since_planting_in: number;
    since_last_spray_in: number;
    last_updated: string | null;
    source: string;
    historical_backfill_status: 'pending' | 'processing' | 'complete' | 'failed';
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Hardened Weather Service.
 * Rainfall now provided by local NOAA MRMS service.
 * Wind/Temp still provided by Visual Crossing for real-time conditions.
 */
export const WeatherService = {
    /**
     * Fetches detailed rainfall stats from the NOAA MRMS backend.
     */
    async fetchFieldRainfall(fieldId: string, signal?: AbortSignal): Promise<RainfallStats> {
        try {
            const { data, error } = await supabase.rpc('get_field_rainfall_stats', { p_field_id: fieldId });
            
            if (error || !data) throw error || new Error('No rainfall data');
            
            return data as RainfallStats;
        } catch (error) {
            console.error('[WeatherService] Error fetching field rainfall:', error);
            return {
                today_in: 0,
                yesterday_in: 0,
                last_7_days_in: 0,
                since_planting_in: 0,
                since_last_spray_in: 0,
                last_updated: null,
                source: 'Supabase (Error)',
                historical_backfill_status: 'failed'
            };
        }
    },

    /**
     * Triggers a manual historical backfill for a field.
     */
    async triggerBackfill(fieldId: string): Promise<void> {
        try {
            await supabase.functions.invoke('mrms-backfill', {
                body: { field_id: fieldId }
            });
        } catch (error) {
            console.error('[WeatherService] Error triggering backfill:', error);
        }
    },

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

        try {
            const url = `${VC_BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current&elements=windspeed,winddir,temp,humidity`;
            const response = await fetch(url, { signal: signal || controller.signal });
            if (!response.ok) throw new Error(`Weather API error: ${response.statusText}`);
            const data = await response.json();
            const current = data.currentConditions;
            
            return {
                windspeed: current?.windspeed ?? null,
                winddir: current?.winddir ?? null,
                windcardinal: this.degreesToDirection(current?.winddir ?? 0),
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
     */
    async fetchCurrentWeather(location: string): Promise<WeatherData & { locationName?: string }> {
        if (!API_KEY || API_KEY === 'undefined') {
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Config Error', isError: true };
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const url = `${VC_BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current&elements=temp,humidity,windspeed,winddir`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Weather API error: ${response.statusText}`);
            const data = await response.json();
            const current = data.currentConditions;

            return {
                temp: Math.round(current.temp),
                humidity: Math.round(current.humidity),
                wind: Math.round(current.windspeed),
                windDirection: this.degreesToDirection(current.winddir),
                locationName: data.address
            };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[WeatherService] Fetch current weather timed out');
            } else {
                console.error('[WeatherService] Error fetching current weather:', error);
            }
            return {
                temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Unknown', isError: true
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
