import { supabase } from '../lib/supabase';
import { RainData } from '../types/weather';

export const RainService = {
  /**
   * Fetches 12h, 24h, and 72h rainfall totals for a field using the Supabase RPC.
   * This aligns with BLUEPRINT.md by using persisted/processed database data.
   */
  async fetchRainfall(args: { 
    fieldId: string;
    signal?: AbortSignal 
  }): Promise<RainData> {
    const { fieldId } = args;
    
    // Calculate date ranges for RPC
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch 24h (Current Day) stats
    const { data: stats24h, error: error24h } = await supabase.rpc('get_rainfall_stats', {
      p_field_id: fieldId,
      p_start_date: today,
      p_end_date: today
    });

    // Fetch 72h stats
    const { data: stats72h, error: error72h } = await supabase.rpc('get_rainfall_stats', {
      p_field_id: fieldId,
      p_start_date: threeDaysAgo,
      p_end_date: today
    });

    if (error24h || error72h) {
      console.error('[RainService] RPC Error:', error24h || error72h);
      throw new Error(`Rainfall data unavailable: ${error24h?.message || error72h?.message}`);
    }

    // RPC returns a table/array of results
    if (!stats24h?.length || !stats72h?.length) {
      console.warn(`[RainService] No rainfall data returned for field ${fieldId}. Check if records are finalized.`);
    }

    const s24 = stats24h?.[0] || { total_inches: 0 };
    const s72 = stats72h?.[0] || { total_inches: 0 };

    const rain24 = Number(s24.total_inches || 0);
    const rain72 = Number(s72.total_inches || 0);
    const rain12 = rain24 * 0.5; // Approximation for 12h since RPC is daily

    return {
      periodEndUtc: now.toISOString(),
      units: 'in',
      rain: {
        '12h': rain12,
        '24h': rain24,
        '72h': rain72
      },
      rainMm: {
        '12h': rain12 * 25.4,
        '24h': rain24 * 25.4,
        '72h': rain72 * 25.4
      },
      location: { 
        type: 'point'
      }
    };
  },

  /**
   * Helper to check if coordinates are within the Continental US.
   */
  isWithinCONUS(lat: number, lon: number): boolean {
    return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  }
};
