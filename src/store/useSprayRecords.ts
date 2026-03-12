import { useCallback } from 'react';
import { SprayRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapSprayToDb } from '@/lib/mappers';

interface UseSprayRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  sprayRecords: SprayRecord[];
  setSprayRecords: React.Dispatch<React.SetStateAction<SprayRecord[]>>;
}

export function useSprayRecords({ farm_id, activeSeason, sprayRecords, setSprayRecords }: UseSprayRecordsArgs) {
  const addSprayRecord = useCallback(async (r: Omit<SprayRecord, 'id' | 'timestamp'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: SprayRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setSprayRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('spray_records').insert([{
      ...mapSprayToDb(newRecord),
      farm_id
    }]);

    if (error) {
      console.error('Error adding spray record:', error);
      setSprayRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save spray record');
    } else {
      toast.success('Spray application recorded!');
    }
  }, [activeSeason, farm_id, setSprayRecords]);

  const updateSprayRecord = useCallback(async (r: SprayRecord) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = sprayRecords.find(item => item.id === r.id);
    setSprayRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('spray_records').upsert({
      ...mapSprayToDb(r),
      farm_id
    });

    if (error) {
      console.error('Error updating spray record:', error);
      if (previous) setSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update spray record');
    } else {
      toast.success('Spray record updated');
    }
  }, [farm_id, sprayRecords, setSprayRecords]);

  const deleteSprayRecords = useCallback(async (ids: string[]) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = sprayRecords.filter(r => ids.includes(r.id));
    setSprayRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('spray_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting spray records:', error);
      setSprayRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }
  }, [farm_id, sprayRecords, setSprayRecords]);

  return { addSprayRecord, updateSprayRecord, deleteSprayRecords };
}
