import { supabase } from '@/lib/supabase';
import { Field } from '@/types/farm';
import { mapFieldToDb } from '@/lib/mappers';

export const fieldService = {
    async createField(field: Omit<Field, 'id'>, id: string, farmId: string) {
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
            .update(payload)
            .eq('id', field.id)
            .eq('farm_id', farmId)
            .select();
    },

    async softDeleteField(id: string, farmId: string) {
        return await supabase
            .from('fields')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('farm_id', farmId)
            .select('id');
    }
};
