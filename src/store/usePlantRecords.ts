import { useCallback } from 'react';
import { PlantRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface UsePlantRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  plantRecords: PlantRecord[];
  setPlantRecords: React.Dispatch<React.SetStateAction<PlantRecord[]>>;
}

export function usePlantRecords({ farm_id, activeSeason, plantRecords, setPlantRecords }: UsePlantRecordsArgs) {
  const addPlantRecord = useCallback(async (r: Omit<PlantRecord, 'id' | 'timestamp'>) => {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: PlantRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setPlantRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('plant_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      seed_variety: r.seedVariety,
      acreage: r.acreage,
      crop: r.crop,
      plant_date: r.plantDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      fsa_field_number: r.fsaFieldNumber,
      intended_use: r.intendedUse,
      producer_share: r.producerShare,
      irrigation_practice: r.irrigationPractice,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
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
    const previous = plantRecords.find(item => item.id === r.id);
    setPlantRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('plant_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      seed_variety: r.seedVariety,
      acreage: r.acreage,
      crop: r.crop,
      plant_date: r.plantDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      fsa_field_number: r.fsaFieldNumber,
      intended_use: r.intendedUse,
      producer_share: r.producerShare,
      irrigation_practice: r.irrigationPractice,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
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
