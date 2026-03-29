import { useCallback, useRef } from 'react';
import { TillageRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapTillageToDb } from '@/lib/mappers';

interface UseTillageRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  setTillageRecords: React.Dispatch<React.SetStateAction<TillageRecord[]>>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useTillageRecords({ farm_id, activeSeason, setTillageRecords }: UseTillageRecordsArgs) {
  const isAdding = useRef(false);
  const previousRef = useRef<TillageRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: TillageRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────

  const addTillageRecord = useCallback(async (
    r: Omit<TillageRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isAdding.current) return false;
    isAdding.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: TillageRecord = { ...r, id, timestamp, seasonYear: activeSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapTillageToDb>;
    try {
      mapped = mapTillageToDb(newRecord);
    } catch (err) {
      console.error('mapTillageToDb failed:', err);
      isAdding.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    // Optimistic add
    setTillageRecords(prev => [...prev, newRecord]);

    try {
      const { error } = await supabase
        .from('tillage_records')
        .insert([{
          ...mapped,
          farm_id
        }]);

      if (error) {
        console.error('Error adding tillage record:', error);
        setTillageRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save tillage record.');
        return false;
      }

      toast.success('Tillage record saved.');
      return true;
    } finally {
      isAdding.current = false;
    }
  }, [activeSeason, farm_id, setTillageRecords]);

  // ─── Update ───────────────────────────────────────────────────────────────

  const updateTillageRecord = useCallback(async (r: TillageRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    let mapped: ReturnType<typeof mapTillageToDb>;
    try {
      mapped = mapTillageToDb(r);
    } catch (err) {
      console.error('mapTillageToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    previousRef.current = undefined;
    setTillageRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { error } = await supabase
      .from('tillage_records')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      console.error('Error updating tillage record:', error);
      const previous = previousRef.current;
      if (previous) {
        setTillageRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      } else {
        setTillageRecords(prev => prev.filter(item => item.id !== r.id));
      }
      toast.error('Failed to update record.');
      return false;
    }

    toast.success('Record updated.');
    return true;
  }, [farm_id, setTillageRecords]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deleteTillageRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    snapshotRef.current = [];
    setTillageRecords(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    const { error } = await supabase
      .from('tillage_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);

    if (error) {
      console.error('Error deleting tillage records:', error);
      // Restore records to their original positions. Sort ascending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => a.index - b.index);
      setTillageRecords(prev => {
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
  }, [farm_id, setTillageRecords]);

  return { addTillageRecord, updateTillageRecord, deleteTillageRecords };
}
