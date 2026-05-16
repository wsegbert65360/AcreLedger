import { supabase } from '@/lib/supabase';
import { Bin } from '@/types/farm';
import { mapBinToDb } from '@/lib/mappers';

export const binService = {
    async createBin(bin: Omit<Bin, 'id'>, id: string, farmId: string) {
        const binData = {
            ...mapBinToDb({ ...bin, id, farm_id: farmId }),
            farm_id: farmId
        };
        return await supabase.from('bins').insert([binData]).select();
    },

    async updateBin(bin: Bin, farmId: string) {
        const mapped = mapBinToDb({ ...bin, farm_id: farmId });
        const { farm_id: _f, id: _i, ...payload } = mapped;
        return await supabase
            .from('bins')
            .update(payload)
            .eq('id', bin.id)
            .eq('farm_id', farmId)
            .select();
    },

    async softDeleteBin(id: string, farmId: string) {
        return await supabase
            .from('bins')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('farm_id', farmId)
            .select('id');
    }
};
