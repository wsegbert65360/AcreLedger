import { supabase } from '@/lib/supabase';
import { Field } from '@/types/farm';
import { mapFieldToDb } from '@/lib/mappers';

export const fieldService = {
    async createField(field: Omit<Field, 'id' | 'farm_id'>, id: string, farmId: string) {
        const fieldData = {
            ...mapFieldToDb({ ...field, id, farm_id: farmId }),
            farm_id: farmId
        };
        return await supabase.from('fields').insert([fieldData]).select();
    },

    async updateField(field: Field, farmId: string) {
        const mapped = mapFieldToDb({ ...field, farm_id: farmId });
        const { farm_id: _f, id: _i, ...payload } = mapped;
        return await supabase
            .from('fields')
            .update(payload, { count: 'exact' })
            .eq('id', field.id)
            .eq('farm_id', farmId);
    },

    async softDeleteField(id: string, farmId: string) {
        const { data, error } = await supabase.rpc('soft_delete_field_with_clu_assignments', {
            p_field_id: id,
            p_farm_id: farmId,
        });
        return { count: data === true ? 1 : 0, error };
    }
};
