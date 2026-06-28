import { useCallback, useRef } from 'react';
import { PlantRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapPlantToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UsePlantRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setPlantRecords: React.Dispatch<React.SetStateAction<PlantRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function usePlantRecords({ farm_id, viewingSeason, setPlantRecords, isOnline, onMutation }: UsePlantRecordsArgs) {
  // Single boolean guard — prevents double-tap duplicate adds regardless of UUID
  const isMutating = useRef(false);

  // Refs for passing values out of state updaters safely across await boundaries
  const previousRef = useRef<PlantRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: PlantRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────

  const addPlantRecord = useCallback(async (
    r: Omit<PlantRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: PlantRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapPlantToDb>;
    try {
      mapped = mapPlantToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapPlantToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Optimistic add
    setPlantRecords(prev => [...prev, newRecord]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('plant_records', 'insert', { ...mapped, farm_id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Planting record saved offline.', {
          description: 'Queued locally — will sync automatically when connection is restored.',
        });
        return true;
      } catch (err) {
        console.error('Failed to enqueue plant record offline:', err);
        setPlantRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save record offline.');
        return false;
      } finally {
        isMutating.current = false;
      }
    }

    try {
      let error;
      try {
        const res = await supabase
          .from('plant_records')
          .insert([{
            ...mapped,
            farm_id
          }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        // Replace with Sentry.captureException(error) in production
        console.error('Error adding plant record:', error);
        setPlantRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save planting record.');
        return false;
      }

      toast.success('Planting record saved.');
      return true;
    } finally {
      // Always release the guard
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setPlantRecords]);

  // ─── Update ───────────────────────────────────────────────────────────────

  const updatePlantRecord = useCallback(async (r: PlantRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapPlantToDb>;
    try {
      mapped = mapPlantToDb(r);
    } catch (err) {
      console.error('mapPlantToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply
    previousRef.current = undefined;
    setPlantRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    try {
    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('plant_records', 'update', { ...mapped, id: r.id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Record updated offline.', {
          description: 'Queued locally — will sync automatically when connection is restored.',
        });
        return true;
      } catch (err) {
        console.error('Failed to enqueue plant record update offline:', err);
        const previous = previousRef.current;
        if (previous) {
          setPlantRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setPlantRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record offline.');
        return false;
      }
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;

    let error, affectedRows;
      try {
        const res = await supabase
          .from('plant_records')
          .update(payload, { count: 'exact' })
          .eq('id', r.id)
          .eq('farm_id', farm_id);
        error = res.error;
        affectedRows = res.count;
      } catch (err) {
        error = err;
      }

    if (error || affectedRows !== 1) {
      if (error) {
        console.error('Error updating plant record:', error);
      } else {
        console.warn('Plant update affected zero rows:', r.id);
      }

      const previous = previousRef.current;
      if (previous) {
        setPlantRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      } else {
        console.warn('No previous record found for rollback, removing optimistic entry:', r.id);
        setPlantRecords(prev => prev.filter(item => item.id !== r.id));
      }

      toast.error('Failed to update record.');
      return false;
    }

    toast.success('Record updated.');
    return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setPlantRecords]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deletePlantRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    if (isMutating.current) return false;
    isMutating.current = true;

    // Capture snapshot into a ref inside the setter
    snapshotRef.current = [];
    setPlantRecords(prev => {
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
          await syncQueue.enqueueMutation('plant_records', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        }
        if (onMutation) await onMutation();
        const count = ids.length;
        toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
          description: 'Queued locally — will sync automatically when connection is restored.',
        });
        return true;
      } catch (err) {
        console.error('Failed to enqueue plant record delete offline:', err);
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setPlantRecords(prev => {
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

    let error, affectedRows;
      try {
        const res = await supabase
          .from('plant_records')
          .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
          .in('id', ids)
          .eq('farm_id', farm_id);
        error = res.error;
        affectedRows = res.count;
      } catch (err) {
        error = err;
      }

    if (error || affectedRows !== ids.length) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        console.error('Error deleting plant records:', error);
      } else {
        console.warn('Plant delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
      }

      // Restore records to their original positions. Sort descending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);

      setPlantRecords(prev => {
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
  }, [farm_id, setPlantRecords]);

  return { addPlantRecord, updatePlantRecord, deletePlantRecords };
}
