import { useCallback, useRef } from 'react';
import { HarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapHarvestToDb } from '@/lib/mappers';

interface UseHarvestRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useHarvestRecords({ farm_id, activeSeason, setHarvestRecords }: UseHarvestRecordsArgs) {
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
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason, deleted_at: null, farm_id };

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
  }, [activeSeason, farm_id, setHarvestRecords]);

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

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { error } = await supabase
      .from('harvest_records')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error updating harvest record:', error);
      
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

    const { error } = await supabase
      .from('harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error deleting harvest records:', error);

      // Restore records to their original positions. Sort ascending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => a.index - b.index);

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
