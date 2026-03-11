import { useCallback } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface UseGrainMovementsArgs {
  farm_id: string | null;
  activeSeason: number;
  grainMovements: GrainMovement[];
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
}

export function useGrainMovements({ farm_id, activeSeason, grainMovements, setGrainMovements }: UseGrainMovementsArgs) {
  const addGrainMovement = useCallback(async (r: Omit<GrainMovement, 'id'> & { timestamp?: number }) => {
    const id = crypto.randomUUID();
    const timestamp = r.timestamp || Date.now();
    const newRecord: GrainMovement = { ...r, id, timestamp, seasonYear: activeSeason };

    setGrainMovements(prev => [...prev, newRecord]);

    const { error } = await supabase.from('grain_movements').insert([{
      id,
      farm_id,
      bin_id: r.binId,
      bin_name: r.binName,
      type: r.type,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      source_field_name: r.sourceFieldName,
      destination: r.destination,
      price: r.price,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
    }]);

    if (error) {
      console.error('Error adding grain movement:', error);
      setGrainMovements(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to record movement');
    } else {
      toast.success('Grain movement recorded!');
    }
  }, [activeSeason, farm_id, setGrainMovements]);

  const updateGrainMovement = useCallback(async (r: GrainMovement) => {
    const previous = grainMovements.find(item => item.id === r.id);
    setGrainMovements(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('grain_movements').upsert({
      id: r.id,
      farm_id,
      bin_id: r.binId,
      bin_name: r.binName,
      type: r.type,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      source_field_name: r.sourceFieldName,
      destination: r.destination,
      price: r.price,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
    });

    if (error) {
      console.error('Error updating grain movement:', error);
      if (previous) setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update grain movement');
    } else {
      toast.success('Grain movement updated');
    }
  }, [farm_id, grainMovements, setGrainMovements]);

  const deleteGrainMovements = useCallback(async (ids: string[]) => {
    const previous = grainMovements.filter(r => ids.includes(r.id));
    setGrainMovements(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('grain_movements')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting grain movements:', error);
      setGrainMovements(prev => [...prev, ...previous]);
      toast.error('Delete failed');
    } else {
      toast.success('Records removed');
    }
  }, [farm_id, grainMovements, setGrainMovements]);

  const getBinTotal = useCallback((binId: string, season?: number) => {
    return grainMovements
      .filter(m => m.binId === binId && (!season || m.seasonYear === season))
      .reduce((total, m) => total + (m.type === 'in' ? m.bushels : -m.bushels), 0);
  }, [grainMovements]);

  return { addGrainMovement, updateGrainMovement, deleteGrainMovements, getBinTotal };
}
