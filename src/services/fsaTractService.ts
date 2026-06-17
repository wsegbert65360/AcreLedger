import { supabase } from '@/lib/supabase';

export const fsaTractService = {
  async importTract(
    id: string,
    tractKey: string,
    filename: string,
    geojson: unknown,
    featureCount: number,
    farmId: string,
  ) {
    const now = new Date().toISOString();
    return await supabase
      .from('fsa_tract_imports')
      .upsert({
        id,
        farm_id: farmId,
        tract_key: tractKey,
        filename,
        feature_count: featureCount,
        geojson,
        imported_at: now,
        deleted_at: null,
      }, { onConflict: 'farm_id,tract_key' })
      .select()
      .single();
  },

  async fetchTracts(farmId: string) {
    return await supabase
      .from('fsa_tract_imports')
      .select('*')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .order('imported_at', { ascending: true });
  },

  async deleteTract(id: string, farmId: string) {
    return await supabase
      .rpc('soft_delete_fsa_tract', {
        p_tract_id: id,
        p_farm_id: farmId,
      });
  },
};
