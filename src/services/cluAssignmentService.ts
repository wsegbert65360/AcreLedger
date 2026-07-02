import { supabase } from '@/lib/supabase';
import type { CluLandUse } from '@/types/fsaTract';

export const cluAssignmentService = {
  async saveAssignment(
    id: string,
    fieldId: string,
    tractKey: string,
    cluNumber: string,
    acres: number,
    landUse: CluLandUse,
    farmId: string,
  ) {
    return await supabase
      .from('field_clu_assignments')
      .upsert({
        id,
        farm_id: farmId,
        field_id: fieldId,
        tract_key: tractKey,
        clu_number: cluNumber,
        acres,
        land_use: landUse,
        deleted_at: null,
      }, { onConflict: 'farm_id,tract_key,clu_number' })
      .select()
      .single();
  },

  async updateLandUse(id: string, landUse: CluLandUse, farmId: string) {
    return await supabase
      .from('field_clu_assignments')
      .update({ land_use: landUse }, { count: 'exact' })
      .eq('id', id)
      .eq('farm_id', farmId)
      .is('deleted_at', null);
  },

  async removeAssignment(id: string, farmId: string, deletedAt = new Date().toISOString()) {
    return await supabase
      .from('field_clu_assignments')
      .update({ deleted_at: deletedAt }, { count: 'exact' })
      .eq('id', id)
      .eq('farm_id', farmId)
      .is('deleted_at', null);
  },

  async fetchAssignmentsForFarm(farmId: string) {
    return await supabase
      .from('field_clu_assignments')
      .select('*')
      .eq('farm_id', farmId)
      .is('deleted_at', null);
  },
};
