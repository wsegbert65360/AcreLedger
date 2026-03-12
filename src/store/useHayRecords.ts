import { useCallback } from 'react';
import { HayHarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapHayToDb } from '@/lib/mappers';

interface UseHayRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  hayHarvestRecords: HayHarvestRecord[];
  setHayHarvestRecords: React.Dispatch<React.SetStateAction<HayHarvestRecord[]>>;
}

export function useHayRecords({ farm_id, activeSeason, hayHarvestRecords, setHayHarvestRecords }: UseHayRecordsArgs) {
  const addHayHarvestRecord = useCallback(async (r: Omit<HayHarvestRecord, 'id' | 'timestamp'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: HayHarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setHayHarvestRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('hay_harvest_records').insert([{
      ...mapHayToDb(newRecord),
      farm_id
    }]);

    if (error) {
      console.error('Error adding hay harvest record:', error);
      setHayHarvestRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save hay record');
    } else {
      toast.success('Hay harvest recorded!');
    }
  }, [activeSeason, farm_id, setHayHarvestRecords]);

  const updateHayHarvestRecord = useCallback(async (r: HayHarvestRecord) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = hayHarvestRecords.find(item => item.id === r.id);
    setHayHarvestRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('hay_harvest_records').upsert({
      ...mapHayToDb(r),
      farm_id
    });

    if (error) {
      console.error('Error updating hay harvest record:', error);
      if (previous) setHayHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update hay record');
    } else {
      toast.success('Hay record updated');
    }
  }, [farm_id, hayHarvestRecords, setHayHarvestRecords]);

  const deleteHayHarvestRecords = useCallback(async (ids: string[]) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = hayHarvestRecords.filter(r => ids.includes(r.id));
    setHayHarvestRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('hay_harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting hay harvest records:', error);
      setHayHarvestRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }
  }, [farm_id, hayHarvestRecords, setHayHarvestRecords]);

  return { addHayHarvestRecord, updateHayHarvestRecord, deleteHayHarvestRecords };
}
