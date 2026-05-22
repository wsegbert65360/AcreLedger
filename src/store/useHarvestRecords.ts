import { useCallback, useRef } from 'react';
import { HarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapHarvestToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseHarvestRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useHarvestRecords({ farm_id, viewingSeason, setHarvestRecords, isOnline, onMutation }: UseHarvestRecordsArgs) {
  // Single boolean guard — prevents double-tap duplicate adds regardless of UUID
  const isAdding = useRef(false);

  // Refs for passing values out of state updaters safely across await boundaries
  const previousRef = useRef<HarvestRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: HarvestRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────

  const addHarvestRecord = useCallback(async (
    r: Omit<HarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isAdding.current) return false;
    isAdding.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapHarvestToDb failed:', err);
      isAdding.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Optimistic add
    setHarvestRecords(prev => [...prev, newRecord]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('harvest_records', 'insert', { ...mapped, farm_id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Harvest recorded offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue harvest record offline:', err);
        setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save record offline.');
        return false;
      } finally {
        isAdding.current = false;
      }
    }

    try {
      const { error } = await supabase
        .from('harvest_records')
        .insert([{
          ...mapped,
          farm_id
        }]);

      if (error) {
        // Replace with Sentry.captureException(error) in production
        console.error('Error adding harvest record:', error);
        setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save harvest record.');
        return false;
      }

      toast.success('Harvest recorded.');
      return true;
    } finally {
      // Always release the guard
      isAdding.current = false;
    }
  }, [viewingSeason, farm_id, setHarvestRecords]);

  // ─── Update ───────────────────────────────────────────────────────────────

  const updateHarvestRecord = useCallback(async (r: HarvestRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(r);
    } catch (err) {
      console.error('mapHarvestToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply
    previousRef.current = undefined;
    setHarvestRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('harvest_records', 'update', { ...mapped, id: r.id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Harvest record updated offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue harvest record update offline:', err);
        const previous = previousRef.current;
        if (previous) {
          setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setHarvestRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record offline.');
        return false;
      }
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { data, error } = await supabase
      .from('harvest_records')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length === 0) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        console.error('Error updating harvest record:', error);
      } else {
        console.warn('Harvest update affected zero rows:', r.id);
      }
      
      const previous = previousRef.current;
      if (previous) {
        setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      } else {
        console.warn('No previous record found for rollback, removing optimistic entry:', r.id);
        setHarvestRecords(prev => prev.filter(item => item.id !== r.id));
      }
      
      toast.error('Failed to update harvest record.');
      return false;
    }

    toast.success('Harvest record updated.');
    return true;
  }, [farm_id, setHarvestRecords]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deleteHarvestRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    // Capture snapshot into a ref inside the setter
    snapshotRef.current = [];
    setHarvestRecords(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    if (!isOnline) {
      try {
        const deletedAt = new Date().toISOString();
        for (const id of ids) {
          await syncQueue.enqueueMutation('harvest_records', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        }
        if (onMutation) await onMutation();
        const count = ids.length;
        toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`);
        return true;
      } catch (err) {
        console.error('Failed to enqueue harvest record delete offline:', err);
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setHarvestRecords(prev => {
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
      .from('harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length !== ids.length) {
      // Replace with Sentry.captureException(error) in production
      if (error) {
        console.error('Error deleting harvest records:', error);
      } else {
        console.warn('Harvest delete mismatch:', { requested: ids.length, affected: data?.length ?? 0 });
      }

      // Restore records to their original positions. Sort descending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);

      setHarvestRecords(prev => {
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
  }, [farm_id, setHarvestRecords]);

  return { addHarvestRecord, updateHarvestRecord, deleteHarvestRecords };
}
