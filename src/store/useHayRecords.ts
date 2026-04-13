import { useCallback, useRef } from 'react';
import { HayHarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapHayToDb } from '@/lib/mappers';

interface UseHayRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  setHayHarvestRecords: React.Dispatch<React.SetStateAction<HayHarvestRecord[]>>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useHayRecords({ farm_id, activeSeason, setHayHarvestRecords }: UseHayRecordsArgs) {
  // Single boolean guard — prevents double-tap duplicate adds regardless of UUID
  const isAdding = useRef(false);

  // Refs for passing values out of state updaters safely across await boundaries
  const previousRef = useRef<HayHarvestRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: HayHarvestRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────

  const addHayHarvestRecord = useCallback(async (
    r: Omit<HayHarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isAdding.current) return false;
    isAdding.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: HayHarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason, deleted_at: null, farm_id };

    // Map before touching state — surface mapper errors before any optimistic update
    let mapped: ReturnType<typeof mapHayToDb>;
    try {
      mapped = mapHayToDb(newRecord);
    } catch (err) {
      // Replace with Sentry.captureException(err) in production
      console.error('mapHayToDb failed:', err);
      isAdding.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Optimistic add
    setHayHarvestRecords(prev => [...prev, newRecord]);

    try {
      const { error } = await supabase
        .from('hay_harvest_records')
        .insert([{
          ...mapped,
          farm_id
        }]);

      if (error) {
        // Replace with Sentry.captureException(error) in production
        console.error('Error adding hay harvest record:', error);
        setHayHarvestRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save hay record.');
        return false;
      }

      toast.success('Hay harvest recorded.');
      return true;
    } finally {
      // Always release the guard
      isAdding.current = false;
    }
  }, [activeSeason, farm_id, setHayHarvestRecords]);

  // ─── Update ───────────────────────────────────────────────────────────────

  const updateHayHarvestRecord = useCallback(async (r: HayHarvestRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    let mapped: ReturnType<typeof mapHayToDb>;
    try {
      mapped = mapHayToDb({ ...r, farm_id });
    } catch (err) {
      console.error('mapHayToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Capture previous record into a ref INSIDE the setter so it's guaranteed
    // to reflect the same state snapshot as the optimistic apply
    previousRef.current = undefined;
    setHayHarvestRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { error } = await supabase
      .from('hay_harvest_records')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error updating hay harvest record:', error);
      
      const previous = previousRef.current;
      if (previous) {
        setHayHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      } else {
        console.warn('No previous record found for rollback, removing optimistic entry:', r.id);
        setHayHarvestRecords(prev => prev.filter(item => item.id !== r.id));
      }
      
      toast.error('Failed to update hay record.');
      return false;
    }

    toast.success('Hay record updated.');
    return true;
  }, [farm_id, setHayHarvestRecords]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deleteHayHarvestRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    // Capture snapshot into a ref inside the setter
    snapshotRef.current = [];
    setHayHarvestRecords(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    const { error } = await supabase
      .from('hay_harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);

    if (error) {
      // Replace with Sentry.captureException(error) in production
      console.error('Error deleting hay harvest records:', error);

      // Restore records to their original positions. Sort descending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);

      setHayHarvestRecords(prev => {
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
  }, [farm_id, setHayHarvestRecords]);

  return { addHayHarvestRecord, updateHayHarvestRecord, deleteHayHarvestRecords };
}
