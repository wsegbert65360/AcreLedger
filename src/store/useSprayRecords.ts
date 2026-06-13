import { useCallback, useRef } from 'react';
import { SprayRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapSprayToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSprayRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setSprayRecords: React.Dispatch<React.SetStateAction<SprayRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSprayRecords({ farm_id, viewingSeason, setSprayRecords, isOnline, onMutation }: UseSprayRecordsArgs) {
  // Single boolean guard — prevents double-tap duplicates on any mutation
  const isMutating = useRef(false);

  // Refs for passing values out of state updaters safely across await boundaries
  const previousRef = useRef<SprayRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: SprayRecord; index: number }[]>([]);

  // ─── Add ────────────────────────────────────────────────────────────────────

  const addSprayRecord = useCallback(async (
    r: Omit<SprayRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: SprayRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapSprayToDb>;
    try {
      mapped = mapSprayToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapSprayToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare spray record — check your inputs.');
      return false;
    }

    // Optimistic add
    setSprayRecords(prev => [...prev, newRecord]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('spray_records', 'insert', { ...mapped, farm_id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Spray application recorded offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue spray record offline:', err);
        setSprayRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save record offline.');
        return false;
      } finally {
        isMutating.current = false;
      }
    }

    try {
      const { error } = await supabase
        .from('spray_records')
        .insert([{ ...mapped, farm_id }]);

      if (error) {
        // Surface specific error details in dev console
        if (import.meta.env.DEV) {
          console.error('Error adding spray record:', error.message, error.details, error.hint, error);
        } else {
          console.error('Error adding spray record:', error.message);
        }
        setSprayRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error(`Failed to save record: ${error.message || 'Database error'}`);
        return false;
      }

      toast.success('Spray application recorded.');
      return true;
    } finally {
      // Always release the guard — even if supabase throws unexpectedly
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setSprayRecords]);

  // ─── Update ─────────────────────────────────────────────────────────────────

  const updateSprayRecord = useCallback(async (r: SprayRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapSprayToDb>;
    try {
      mapped = mapSprayToDb({ ...r, farm_id });
    } catch (err) {
      console.error('mapSprayToDb failed:', err);
      toast.error('Failed to prepare spray record — check your inputs.');
      return false;
    } finally {
      isMutating.current = false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply — safe to read
    // after the following await.
    previousRef.current = undefined;
    setSprayRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('spray_records', 'update', { ...mapped, id: r.id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Spray record updated offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue spray record update offline:', err);
        const previous = previousRef.current;
        if (previous) {
          setSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setSprayRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update spray record offline.');
        return false;
      }
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { data, error } = await supabase
      .from('spray_records')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length === 0) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating spray record:', error.message, error.details, error.hint, error);
        } else {
          console.error('Error updating spray record:', error.message);
        }
      } else {
        console.warn('Spray update affected zero rows:', r.id);
      }

      const previous = previousRef.current;
      if (previous) {
        setSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      } else {
        // Record wasn't in local state — pull the optimistic entry out entirely
        console.warn('No previous record found for rollback, removing optimistic entry:', r.id);
        setSprayRecords(prev => prev.filter(item => item.id !== r.id));
      }

      toast.error('Failed to update spray record.');
      return false;
    }

    toast.success('Spray record updated.');
    return true;
  }, [farm_id, setSprayRecords]);

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const deleteSprayRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    if (isMutating.current) return false;
    isMutating.current = true;

    // Capture snapshot into a ref inside the setter so it's guaranteed to be
    // populated by the time we read it after the await.
    snapshotRef.current = [];
    setSprayRecords(prev => {
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
          await syncQueue.enqueueMutation('spray_records', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        }
        if (onMutation) await onMutation();
        const count = ids.length;
        toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`);
        return true;
      } catch (err) {
        console.error('Failed to enqueue spray record delete offline:', err);
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setSprayRecords(prev => {
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
      .from('spray_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length !== ids.length) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        console.error('Error deleting spray records:', error);
      } else {
        console.warn('Spray delete mismatch:', { requested: ids.length, affected: data?.length ?? 0 });
      }

      // Restore records to their original positions. Sort descending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);

      setSprayRecords(prev => {
        const restored = [...prev];
        for (const { record, index } of snapshot) {
          // Clamp to current length in case concurrent mutations changed it
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
  }, [farm_id, setSprayRecords]);

  return { addSprayRecord, updateSprayRecord, deleteSprayRecords };
}
