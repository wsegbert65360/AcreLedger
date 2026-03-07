import { supabase } from '@/lib/supabase';
import { Bin } from '@/types/farm';
import { mapBinToDb } from '@/lib/mappers';

export const binService = {
    async createBin(bin: Omit<Bin, 'id'>, id: string, farmId: string) {
        const binData = {
            ...mapBinToDb({ ...bin, id }),
            farm_id: farmId
        };
        return await supabase.from('bins').insert([binData]).select();
    },

    async updateBin(bin: Bin, farmId: string) {
        const updateData = {
            ...mapBinToDb(bin),
            farm_id: farmId,
            deleted_at: bin.deleted_at
        };
        return await supabase.from('bins').upsert(updateData).select();
    },

    async softDeleteBin(id: string, farmId: string) {
        return await supabase
            .from('bins')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('farm_id', farmId);
    }
};
