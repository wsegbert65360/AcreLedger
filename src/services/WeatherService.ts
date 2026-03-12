import { WeatherData } from '../types/weather';

const API_KEY = import.meta.env.VITE_VISUALCROSSING_KEY;
const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';
import { supabase } from '@/lib/supabase';

export interface RainfallStats {
    today_mm: number;
    yesterday_mm: number;
    last_7_days_mm: number;
    since_planting_mm: number;
    since_last_spray_mm: number;
    last_updated: string | null;
    source: string;
    historical_backfill_status: 'pending' | 'processing' | 'complete' | 'failed';
}

const SUPABASE_PROJECT_URL = 'https://rtzqswpmhlbrbxjwyywl.supabase.co';

/**
 * Hardened Weather Service.
 * Rainfall now provided by local NOAA MRMS service.
 * Wind/Temp still provided by Visual Crossing for real-time conditions.
 */
export const WeatherService = {
    /**
     * Fetches detailed rainfall stats from the NOAA MRMS backend.
     */
    async fetchFieldRainfall(fieldId: string): Promise<RainfallStats> {
        try {
            // Since we are using Supabase, we can fetch stats directly from the DB
            // rather than going through an intermediate API for reading.
            const { data, error } = await supabase.rpc('get_field_rainfall_stats', { p_field_id: fieldId });
            
            if (error || !data) throw error || new Error('No rainfall data');
            
            return data;
        } catch (error) {
            console.error('[WeatherService] Error fetching field rainfall:', error);
            return {
                today_mm: 0,
                yesterday_mm: 0,
                last_7_days_mm: 0,
                since_planting_mm: 0,
                since_last_spray_mm: 0,
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
     */
    async fetchFieldConditions(lat: number, lng: number): Promise<{ windspeed: number; winddir: number }> {
        const location = `${lat},${lng}`;
        if (!API_KEY || API_KEY === 'undefined') return { windspeed: 0, winddir: 0 };

        try {
            const url = `${VC_BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current&elements=windspeed,winddir`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Weather API error: ${response.statusText}`);
            const data = await response.json();
            
            return {
                windspeed: data.currentConditions?.windspeed ?? 0,
                winddir: data.currentConditions?.winddir ?? 0
            };
        } catch (error) {
            console.error('[WeatherService] Error fetching field conditions:', error);
            return { windspeed: 0, winddir: 0 };
        }
    },

    /**
     * Fetches current weather data for the Weather Bar via Visual Crossing.
     */
    async fetchCurrentWeather(location: string): Promise<WeatherData & { locationName?: string }> {
        if (!API_KEY || API_KEY === 'undefined') {
            return { temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Config Error', isError: true };
        }
        
        try {
            const url = `${VC_BASE_URL}/${location}/today?unitGroup=us&key=${API_KEY}&contentType=json&include=current`;
            const response = await fetch(url);
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
        } catch (error) {
            console.error('[WeatherService] Error fetching current weather:', error);
            return {
                temp: 0, humidity: 0, wind: 0, windDirection: '—', locationName: 'Unknown', isError: true
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
