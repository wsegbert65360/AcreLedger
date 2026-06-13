import { useCallback, useRef } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseGrainMovementsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useGrainMovements({ farm_id, viewingSeason, setGrainMovements, isOnline, onMutation }: UseGrainMovementsArgs) {
  // Single boolean guard — prevents double-tap duplicate adds regardless of UUID
  const isMutating = useRef(false);

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

    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = r.timestamp || Date.now();
    const newRecord: GrainMovement = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapGrainToDb>;
    try {
      mapped = mapGrainToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapGrainToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Optimistic add
    setGrainMovements(prev => [...prev, newRecord]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('grain_movements', 'insert', { ...mapped, farm_id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Grain movement recorded offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue grain movement offline:', err);
        setGrainMovements(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to record movement offline.');
        return false;
      } finally {
        isMutating.current = false;
      }
    }

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
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setGrainMovements, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────

  const updateGrainMovement = useCallback(async (r: GrainMovement): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapGrainToDb>;
    try {
      mapped = mapGrainToDb(r);
    } catch (err) {
      console.error('mapGrainToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    } finally {
      isMutating.current = false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply
    previousRef.current = undefined;
    setGrainMovements(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    const previous = previousRef.current as GrainMovement | undefined;
    if (!previous) {
      console.warn('Grain update aborted: missing previous snapshot for optimistic rollback.', { id: r.id });
      setGrainMovements(prev => prev.filter(item => item.id !== r.id));
      toast.error('Could not update movement — record snapshot missing. Please refresh and try again.');
      return false;
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;
    const previousTimestampIso = new Date(previous.timestamp).toISOString();

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('grain_movements', 'update', { ...mapped, id: r.id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Grain movement updated offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue grain movement update offline:', err);
        setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
        toast.error('Failed to update record offline.');
        return false;
      }
    }

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
  }, [farm_id, setGrainMovements, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deleteGrainMovements = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    if (isMutating.current) return false;
    isMutating.current = true;

    // Capture snapshot into a ref inside the setter
    snapshotRef.current = [];
    setGrainMovements(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    try {
    if (!isOnline) {
      try {
        const deletedAt = new Date().toISOString();
        for (const id of ids) {
          await syncQueue.enqueueMutation('grain_movements', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        }
        if (onMutation) await onMutation();
        const count = ids.length;
        toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`);
        return true;
      } catch (err) {
        console.error('Failed to enqueue grain movements delete offline:', err);
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setGrainMovements(prev => {
          const restored = [...prev];
          for (const { record, index } of snapshot) {
            const insertAt = Math.min(index, restored.length);
            restored.splice(insertAt, 0, record);
          }
          return restored;
        });
        toast.error('Failed to delete records offline.');
        return false;
      }
    }

    const { data, error } = await supabase
      .from('grain_movements')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length !== ids.length) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        console.error('Error deleting grain movements:', error);
      } else {
        console.warn('Grain delete mismatch:', { requested: ids.length, affected: data?.length ?? 0 });
      }

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
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setGrainMovements, isOnline, onMutation]);

  return { addGrainMovement, updateGrainMovement, deleteGrainMovements };
}
