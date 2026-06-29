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

type OpResult = boolean;

export function useHarvestRecords({ farm_id, viewingSeason, setHarvestRecords, isOnline, onMutation }: UseHarvestRecordsArgs) {
  const isMutating = useRef(false);
  const previousRef = useRef<HarvestRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: HarvestRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addHarvestRecord = useCallback(async (
    r: Omit<HarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'> & { id?: string; timestamp?: number }
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const id = r.id ?? crypto.randomUUID();
    const timestamp = r.timestamp ?? Date.now();
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(newRecord);
    } catch (err) {
      console.error('mapHarvestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    setHarvestRecords(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('harvest_records', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Harvest recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue harvest record offline:', err);
          setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('harvest_records')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding harvest record:', error);
        setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save harvest record.');
        return false;
      }

      toast.success('Harvest recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setHarvestRecords, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateHarvestRecord = useCallback(async (r: HarvestRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(r);
    } catch (err) {
      console.error('mapHarvestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    previousRef.current = undefined;
    setHarvestRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('harvest_records', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Harvest record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
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
      let error, affectedRows;
      try {
        const res = await supabase
          .from('harvest_records')
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
          console.error('Error updating harvest record:', error);
        } else {
          console.warn('Harvest update affected zero rows:', r.id);
        }
        const previous = previousRef.current;
        if (previous) {
          setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setHarvestRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record.');
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setHarvestRecords, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteHarvestRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    snapshotRef.current = [];
    setHarvestRecords(prev => {
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
            await syncQueue.enqueueMutation('harvest_records', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
          }
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
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

      let error, affectedRows;
      try {
        const res = await supabase
          .from('harvest_records')
          .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
          .in('id', ids)
          .eq('farm_id', farm_id);
        error = res.error;
        affectedRows = res.count;
      } catch (err) {
        error = err;
      }

      if (error || affectedRows !== ids.length) {
        if (error) {
          console.error('Error deleting harvest records:', error);
        } else {
          console.warn('Harvest delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }
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
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setHarvestRecords, isOnline, onMutation]);

  return { addHarvestRecord, updateHarvestRecord, deleteHarvestRecords };
}
