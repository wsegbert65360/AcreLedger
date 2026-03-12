import { useCallback, useMemo } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb } from '@/lib/mappers';

interface UseGrainMovementsArgs {
  farm_id: string | null;
  activeSeason: number;
  grainMovements: GrainMovement[];
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
}

export function useGrainMovements({ farm_id, activeSeason, grainMovements, setGrainMovements }: UseGrainMovementsArgs) {
  const addGrainMovement = useCallback(async (r: Omit<GrainMovement, 'id'> & { timestamp?: number }) => {
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const id = crypto.randomUUID();
    const timestamp = r.timestamp || Date.now();
    const newRecord: GrainMovement = { ...r, id, timestamp, seasonYear: activeSeason };

    setGrainMovements(prev => [...prev, newRecord]);

    const { error } = await supabase.from('grain_movements').insert([{
      ...mapGrainToDb(newRecord),
      farm_id
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
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
    const previous = grainMovements.find(item => item.id === r.id);
    setGrainMovements(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('grain_movements').upsert({
      ...mapGrainToDb(r),
      farm_id
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
    if (!farm_id) {
      toast.error('No farm selected');
      return;
    }
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

  const binTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    grainMovements.forEach(m => {
      const sKey = `${m.binId}-${m.seasonYear}`;
      totals[sKey] = (totals[sKey] || 0) + (m.type === 'in' ? m.bushels : -m.bushels);

      const aKey = `${m.binId}-all`;
      totals[aKey] = (totals[aKey] || 0) + (m.type === 'in' ? m.bushels : -m.bushels);
    });
    return totals;
  }, [grainMovements]);

  const getBinTotal = useCallback((binId: string, season?: number) => {
    const key = season ? `${binId}-${season}` : `${binId}-all`;
    return binTotals[key] || 0;
  }, [binTotals]);

  return { addGrainMovement, updateGrainMovement, deleteGrainMovements, getBinTotal };
}
