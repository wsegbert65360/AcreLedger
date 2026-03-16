import { useCallback, useRef } from 'react';
import { SprayRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapSprayToDb } from '@/lib/mappers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSprayRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  setSprayRecords: React.Dispatch<React.SetStateAction<SprayRecord[]>>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSprayRecords({ farm_id, activeSeason, setSprayRecords }: UseSprayRecordsArgs) {
  // Single boolean guard — prevents double-tap duplicate adds regardless of UUID
  const isAdding = useRef(false);

  // Refs for passing values out of state updaters safely across await boundaries
  const previousRef = useRef<SprayRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: SprayRecord; index: number }[]>([]);

  // ─── Add ────────────────────────────────────────────────────────────────────

  const addSprayRecord = useCallback(async (
    r: Omit<SprayRecord, 'id' | 'timestamp'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isAdding.current) return false;
    isAdding.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: SprayRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapSprayToDb>;
    try {
      mapped = mapSprayToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapSprayToDb failed:', err);
      isAdding.current = false;
      toast.error('Failed to prepare spray record — check your inputs.');
      return false;
    }

    // Optimistic add
    setSprayRecords(prev => [...prev, newRecord]);

    try {
      const { error } = await supabase
        .from('spray_records')
        .insert([{ ...mapped, farm_id }]);

      if (error) {
        // Replace with Sentry.captureException(error) in production
        console.error('Error adding spray record:', error);
        setSprayRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save spray record.');
        return false;
      }

      toast.success('Spray application recorded.');
      return true;
    } finally {
      // Always release the guard — even if supabase throws unexpectedly
      isAdding.current = false;
    }
  }, [activeSeason, farm_id, setSprayRecords]);

  // ─── Update ─────────────────────────────────────────────────────────────────

  const updateSprayRecord = useCallback(async (r: SprayRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    let mapped: ReturnType<typeof mapSprayToDb>;
    try {
      mapped = mapSprayToDb(r);
    } catch (err) {
      console.error('mapSprayToDb failed:', err);
      toast.error('Failed to prepare spray record — check your inputs.');
      return false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply — safe to read
    // after the following await.
    previousRef.current = undefined;
    setSprayRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    const { error } = await supabase
      .from('spray_records')
      .update(mapped)                   // farm_id is a relational key — filter only, never updated
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error updating spray record:', error);

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

    // Capture snapshot into a ref inside the setter so it's guaranteed to be
    // populated by the time we read it after the await.
    snapshotRef.current = [];
    setSprayRecords(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    const { error } = await supabase
      .from('spray_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error deleting spray records:', error);

      // Restore records to their original positions. Sort descending by index
      // so each splice lands correctly regardless of prior insertions in the loop.
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
  }, [farm_id, setSprayRecords]);

  return { addSprayRecord, updateSprayRecord, deleteSprayRecords };
}