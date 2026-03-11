import { useCallback } from 'react';
import { SprayRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface UseSprayRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  sprayRecords: SprayRecord[];
  setSprayRecords: React.Dispatch<React.SetStateAction<SprayRecord[]>>;
}

export function useSprayRecords({ farm_id, activeSeason, sprayRecords, setSprayRecords }: UseSprayRecordsArgs) {
  const addSprayRecord = useCallback(async (r: Omit<SprayRecord, 'id' | 'timestamp'>) => {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: SprayRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setSprayRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('spray_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      product: r.product,
      products: r.products,
      wind_speed: r.windSpeed,
      temperature: r.temperature,
      spray_date: r.sprayDate,
      start_time: r.startTime,
      equipment_id: r.equipmentId,
      applicator_name: r.applicatorName,
      license_number: r.licenseNumber,
      epa_reg_number: r.epaRegNumber,
      target_pest: r.targetPest,
      wind_direction: r.windDirection,
      relative_humidity: r.relativeHumidity,
      treated_area_size: r.treatedAreaSize,
      total_amount_applied: r.totalAmountApplied,
      involved_technicians: r.involvedTechnicians,
      mixture_rate: r.mixtureRate,
      total_mixture_volume: r.totalMixtureVolume,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
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
    const previous = sprayRecords.find(item => item.id === r.id);
    setSprayRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('spray_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      product: r.product,
      products: r.products,
      wind_speed: r.windSpeed,
      temperature: r.temperature,
      spray_date: r.sprayDate,
      start_time: r.startTime,
      equipment_id: r.equipmentId,
      applicator_name: r.applicatorName,
      license_number: r.licenseNumber,
      epa_reg_number: r.epaRegNumber,
      target_pest: r.targetPest,
      wind_direction: r.windDirection,
      relative_humidity: r.relativeHumidity,
      treated_area_size: r.treatedAreaSize,
      total_amount_applied: r.totalAmountApplied,
      involved_technicians: r.involvedTechnicians,
      mixture_rate: r.mixtureRate,
      total_mixture_volume: r.totalMixtureVolume,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
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
