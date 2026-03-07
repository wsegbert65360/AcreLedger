import { supabase } from '@/lib/supabase';
import { Field } from '@/types/farm';
import { mapFieldToDb } from '@/lib/mappers';

export const fieldService = {
    async createField(field: Omit<Field, 'id'>, id: string, farmId: string) {
        const fieldData = {
            ...mapFieldToDb({ ...field, id }),
            farm_id: farmId
        };
        return await supabase.from('fields').insert([fieldData]).select();
    },

    async updateField(field: Field, farmId: string) {
        const updateData = {
            ...mapFieldToDb(field),
            farm_id: farmId,
            deleted_at: field.deleted_at
        };
        return await supabase.from('fields').upsert(updateData).select();
    },

    async softDeleteField(id: string, farmId: string) {
        return await supabase
            .from('fields')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('farm_id', farmId);
    }
};
