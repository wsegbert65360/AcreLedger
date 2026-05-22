import { useCallback, useRef } from 'react';
import { TillageRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapTillageToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseTillageRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setTillageRecords: React.Dispatch<React.SetStateAction<TillageRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

export function useTillageRecords({ farm_id, viewingSeason, setTillageRecords, isOnline, onMutation }: UseTillageRecordsArgs) {
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
    const newRecord: TillageRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

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

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('tillage_records', 'insert', { ...mapped, farm_id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Tillage record saved offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue tillage record offline:', err);
        setTillageRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save record offline.');
        return false;
      } finally {
        isAdding.current = false;
      }
    }

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
  }, [viewingSeason, farm_id, setTillageRecords, isOnline, onMutation]);

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

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('tillage_records', 'update', { ...mapped, id: r.id }, farm_id);
        if (onMutation) await onMutation();
        toast.success('Record updated offline.');
        return true;
      } catch (err) {
        console.error('Failed to enqueue tillage record update offline:', err);
        const previous = previousRef.current;
        if (previous) {
          setTillageRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setTillageRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record offline.');
        return false;
      }
    }

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { data, error } = await supabase
      .from('tillage_records')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length === 0) {
      if (error) {
        console.error('Error updating tillage record:', error);
      } else {
        console.warn('Tillage update affected zero rows:', r.id);
      }
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
  }, [farm_id, setTillageRecords, isOnline, onMutation]);

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

    if (!isOnline) {
      try {
        const deletedAt = new Date().toISOString();
        for (const id of ids) {
          await syncQueue.enqueueMutation('tillage_records', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
        }
        if (onMutation) await onMutation();
        const count = ids.length;
        toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`);
        return true;
      } catch (err) {
        console.error('Failed to enqueue tillage records delete offline:', err);
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setTillageRecords(prev => {
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
      .from('tillage_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id)
      .select('id');

    if (error || !data || data.length !== ids.length) {
      if (error) {
        console.error('Error deleting tillage records:', error);
      } else {
        console.warn('Tillage delete mismatch:', { requested: ids.length, affected: data?.length ?? 0 });
      }
      // Restore records to their original positions. Sort descending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
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
  }, [farm_id, setTillageRecords, isOnline, onMutation]);

  return { addTillageRecord, updateTillageRecord, deleteTillageRecords };
}
