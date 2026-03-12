import { useCallback } from 'react';
import { HarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapHarvestToDb } from '@/lib/mappers';

interface UseHarvestRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  harvestRecords: HarvestRecord[];
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
}

export function useHarvestRecords({ farm_id, activeSeason, harvestRecords, setHarvestRecords }: UseHarvestRecordsArgs) {
  const addHarvestRecord = useCallback(async (r: Omit<HarvestRecord, 'id' | 'timestamp'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setHarvestRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('harvest_records').insert([{
      ...mapHarvestToDb(newRecord),
      farm_id
    }]);

    if (error) {
      console.error('Error adding harvest record:', error);
      setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save harvest');
    } else {
      toast.success('Harvest recorded!');
    }
  }, [activeSeason, farm_id, setHarvestRecords]);

  const updateHarvestRecord = useCallback(async (r: HarvestRecord) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = harvestRecords.find(item => item.id === r.id);
    setHarvestRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('harvest_records').upsert({
      ...mapHarvestToDb(r),
      farm_id
    });

    if (error) {
      console.error('Error updating harvest record:', error);
      if (previous) setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update harvest');
    } else {
      toast.success('Harvest updated');
    }
  }, [farm_id, harvestRecords, setHarvestRecords]);

  const deleteHarvestRecords = useCallback(async (ids: string[]) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = harvestRecords.filter(r => ids.includes(r.id));
    setHarvestRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting harvest records:', error);
      setHarvestRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }
  }, [farm_id, harvestRecords, setHarvestRecords]);

  return { addHarvestRecord, updateHarvestRecord, deleteHarvestRecords };
}
