import { supabase } from '@/lib/supabase';
import type { CountyBoundary, CountyBounds } from '@/lib/county/types';

interface BoundaryRpcRow {
  fips: string;
  name: string;
  state_abbr: string;
  state_fips: string;
  geometry: CountyBoundary['geometry'];
  dataset_source: string;
  dataset_version: string;
}

/** The RPC caps its answer; a full page means the area may not be fully covered. */
export const COUNTY_RPC_LIMIT = 40;

export const countyBoundaryService = {
  async fetchBoundaries(bounds: CountyBounds): Promise<{ data: CountyBoundary[] | null; error: unknown }> {
    const { data, error } = await supabase.rpc('get_county_boundaries', {
      p_min_lng: bounds.minLng,
      p_min_lat: bounds.minLat,
      p_max_lng: bounds.maxLng,
      p_max_lat: bounds.maxLat,
    });
    if (error || !data) return { data: null, error };
    return {
      data: (data as BoundaryRpcRow[]).map(r => ({
        fips: r.fips,
        name: r.name,
        stateAbbr: r.state_abbr,
        stateFips: r.state_fips,
        geometry: r.geometry,
        datasetSource: r.dataset_source,
        datasetVersion: r.dataset_version,
      })),
      error: null,
    };
  },
};
