import { useCallback } from 'react';
import { PlantRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapPlantToDb } from '@/lib/mappers';

interface UsePlantRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  plantRecords: PlantRecord[];
  setPlantRecords: React.Dispatch<React.SetStateAction<PlantRecord[]>>;
}

export function usePlantRecords({ farm_id, activeSeason, plantRecords, setPlantRecords }: UsePlantRecordsArgs) {
  const addPlantRecord = useCallback(async (r: Omit<PlantRecord, 'id' | 'timestamp'>) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: PlantRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setPlantRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('plant_records').insert([{
      ...mapPlantToDb(newRecord),
      farm_id
    }]);

    if (error) {
      console.error('Error adding plant record:', error);
      setPlantRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save planting record');
    } else {
      toast.success('Planting record saved!');
    }
  }, [activeSeason, farm_id, setPlantRecords]);

  const updatePlantRecord = useCallback(async (r: PlantRecord) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = plantRecords.find(item => item.id === r.id);
    setPlantRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('plant_records').upsert({
      ...mapPlantToDb(r),
      farm_id
    });

    if (error) {
      console.error('Error updating plant record:', error);
      if (previous) setPlantRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update record');
    } else {
      toast.success('Record updated');
    }
  }, [farm_id, plantRecords, setPlantRecords]);

  const deletePlantRecords = useCallback(async (ids: string[]) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = plantRecords.filter(r => ids.includes(r.id));
    setPlantRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('plant_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting plant records:', error);
      setPlantRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }
  }, [farm_id, plantRecords, setPlantRecords]);

  return { addPlantRecord, updatePlantRecord, deletePlantRecords };
}
