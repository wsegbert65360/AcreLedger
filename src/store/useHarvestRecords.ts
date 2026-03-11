import { useCallback } from 'react';
import { HarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface UseHarvestRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  harvestRecords: HarvestRecord[];
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
}

export function useHarvestRecords({ farm_id, activeSeason, harvestRecords, setHarvestRecords }: UseHarvestRecordsArgs) {
  const addHarvestRecord = useCallback(async (r: Omit<HarvestRecord, 'id' | 'timestamp'>) => {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setHarvestRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('harvest_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      crop: r.crop,
      destination: r.destination,
      bin_id: r.binId,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      landlord_split_percent: r.landlordSplitPercent,
      harvest_date: r.harvestDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
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
    const previous = harvestRecords.find(item => item.id === r.id);
    setHarvestRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('harvest_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      crop: r.crop,
      destination: r.destination,
      bin_id: r.binId,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      landlord_split_percent: r.landlordSplitPercent,
      harvest_date: r.harvestDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
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
