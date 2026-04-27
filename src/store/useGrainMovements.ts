import { useCallback, useRef } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb } from '@/lib/mappers';

interface UseGrainMovementsArgs {
  farm_id: string | null;
  activeSeason: number;
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useGrainMovements({ farm_id, activeSeason, setGrainMovements }: UseGrainMovementsArgs) {
  // Single boolean guard — prevents double-tap duplicate adds regardless of UUID
  const isAdding = useRef(false);

  // Refs for passing values out of state updaters safely across await boundaries
  const previousRef = useRef<GrainMovement | undefined>(undefined);
  const snapshotRef = useRef<{ record: GrainMovement; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────

  const addGrainMovement = useCallback(async (
    r: Omit<GrainMovement, 'id' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { timestamp?: number }
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isAdding.current) return false;
    isAdding.current = true;

    const id = crypto.randomUUID();
    const timestamp = r.timestamp || Date.now();
    const newRecord: GrainMovement = { ...r, id, timestamp, seasonYear: activeSeason, deleted_at: null, farm_id };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapGrainToDb>;
    try {
      mapped = mapGrainToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapGrainToDb failed:', err);
      isAdding.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Optimistic add
    setGrainMovements(prev => [...prev, newRecord]);

    try {
      const { error } = await supabase
        .from('grain_movements')
        .insert([{
          ...mapped,
          farm_id
        }]);

      if (error) {
        // Replace with Sentry.captureException(error) in production
        console.error('Error adding grain movement:', error);
        setGrainMovements(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to record movement.');
        return false;
      }

      toast.success('Grain movement recorded.');
      return true;
    } finally {
      // Always release the guard
      isAdding.current = false;
    }
  }, [activeSeason, farm_id, setGrainMovements]);

  // ─── Update ───────────────────────────────────────────────────────────────

  const updateGrainMovement = useCallback(async (r: GrainMovement): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    let mapped: ReturnType<typeof mapGrainToDb>;
    try {
      mapped = mapGrainToDb(r);
    } catch (err) {
      console.error('mapGrainToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply
    previousRef.current = undefined;
    setGrainMovements(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    const previous = previousRef.current;
    if (!previous) {
      console.warn('Grain update aborted: missing previous snapshot for optimistic rollback.', { id: r.id });
      setGrainMovements(prev => prev.filter(item => item.id !== r.id));
      toast.error('Could not update movement — record snapshot missing. Please refresh and try again.');
      return false;
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;
    const previousTimestampIso = new Date(previous.timestamp).toISOString();

    const { data, error } = await supabase
      .from('grain_movements')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id)
      .eq('timestamp', previousTimestampIso)
      .select('id');

    if (error || !data || data.length === 0) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        console.error('Error updating grain movement:', error);
      } else {
        console.warn('Grain update concurrency conflict detected.', {
          id: r.id,
          expectedTimestamp: previousTimestampIso,
        });
      }
      
      setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
      
      toast.error(error ? 'Failed to update grain movement.' : 'This movement changed elsewhere. Please refresh and try again.');
      return false;
    }

    toast.success('Grain movement updated.');
    return true;
  }, [farm_id, setGrainMovements]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deleteGrainMovements = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    // Capture snapshot into a ref inside the setter
    snapshotRef.current = [];
    setGrainMovements(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    const { error } = await supabase
      .from('grain_movements')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error deleting grain movements:', error);

      // Restore records to their original positions. Sort descending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);

      setGrainMovements(prev => {
        const restored = [...prev];
        for (const { record, index } of snapshot) {
          const insertAt = Math.min(index, restored.length);
          restored.splice(insertAt, 0, record);
        }
        return restored;
      });

      toast.error('Failed to delete records.');
      return false;
    }

    const count = ids.length;
    toast.success(`${count} record${count !== 1 ? 's' : ''} deleted.`);
    return true;
  }, [farm_id, setGrainMovements]);

  return { addGrainMovement, updateGrainMovement, deleteGrainMovements };
}
