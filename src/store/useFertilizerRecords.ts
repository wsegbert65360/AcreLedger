import { useCallback } from 'react';
import { FertilizerApplication, Field } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapFertilizerToDb } from '@/lib/mappers';

interface UseFertilizerRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  fields: Field[];
  fertilizerApplications: FertilizerApplication[];
  setFertilizerApplications: React.Dispatch<React.SetStateAction<FertilizerApplication[]>>;
}

export function useFertilizerRecords({ farm_id, activeSeason, fields, fertilizerApplications, setFertilizerApplications }: UseFertilizerRecordsArgs) {
  const addFertilizerApplication = useCallback(async (r: Omit<FertilizerApplication, 'id' | 'created_at' | 'updated_at' | 'fieldName'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newRecord: FertilizerApplication = {
      ...r,
      id,
      created_at: now,
      updated_at: now,
      fieldName: fields.find(f => f.id === r.fieldId)?.name || 'Unknown Field'
    };

    setFertilizerApplications(prev => [...prev, newRecord]);

    const { error } = await supabase.from('fertilizer_applications').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      date: r.date,
      acres: r.acres,
      fertilizer_formula: r.fertilizer_formula,
      season_year: r.season_year || activeSeason
    }]);

    if (error) {
      console.error('Error adding fertilizer application:', error);
      setFertilizerApplications(prev => prev.filter(rec => rec.id !== id));
      toast.error(`Failed to save: ${error.message}`);
    } else {
      toast.success('Fertilizer application recorded!');
    }
  }, [activeSeason, farm_id, fields, setFertilizerApplications]);

  const updateFertilizerApplication = useCallback(async (r: FertilizerApplication) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = fertilizerApplications.find(item => item.id === r.id);
    setFertilizerApplications(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('fertilizer_applications').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      date: r.date,
      acres: r.acres,
      fertilizer_formula: r.fertilizer_formula,
      season_year: r.season_year,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Error updating fertilizer application:', error);
      if (previous) setFertilizerApplications(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update record');
    } else {
      toast.success('Record updated');
    }
  }, [farm_id, fertilizerApplications, setFertilizerApplications]);

  const deleteFertilizerApplications = useCallback(async (ids: string[]) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = fertilizerApplications.filter(r => ids.includes(r.id));
    setFertilizerApplications(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('fertilizer_applications')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting fertilizer applications:', error);
      setFertilizerApplications(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }
  }, [farm_id, fertilizerApplications, setFertilizerApplications]);

  return { addFertilizerApplication, updateFertilizerApplication, deleteFertilizerApplications };
}
