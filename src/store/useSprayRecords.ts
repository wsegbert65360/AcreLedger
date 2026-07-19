import { useCallback, useRef } from 'react';
import { SprayRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapSprayToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseSprayRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setSprayRecords: React.Dispatch<React.SetStateAction<SprayRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function useSprayRecords({ farm_id, viewingSeason, setSprayRecords, isOnline, onMutation }: UseSprayRecordsArgs) {
  const isMutating = useRef(false);
  const previousRef = useRef<SprayRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: SprayRecord; index: number }[]>([]);

  // ─── Add ────────────────────────────────────────────────────────────────────
  const addSprayRecord = useCallback(async (
    r: Omit<SprayRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>
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

    let mapped: ReturnType<typeof mapSprayToDb>;
    try {
      mapped = mapSprayToDb(newRecord);
    } catch (err) {
      console.error('mapSprayToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare spray record — check inputs.');
      return false;
    }

    setSprayRecords(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('spray_records', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Spray application recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue spray record offline:', err);
          setSprayRecords(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('spray_records')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding spray record:', error);
        setSprayRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save record.');
        return false;
      }

      toast.success('Spray application recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setSprayRecords, isOnline, onMutation]);

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
      isMutating.current = false;
      toast.error('Failed to prepare spray record — check inputs.');
      return false;
    }

    previousRef.current = undefined;
    setSprayRecords(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('spray_records', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Spray record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
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
      let error, affectedRows;
      try {
        const res = await supabase
          .from('spray_records')
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
          console.error('Error updating spray record:', error);
        } else {
          console.warn('Spray update affected zero rows:', r.id);
        }
        const previous = previousRef.current;
        if (previous) {
          setSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setSprayRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update spray record.');
        return false;
      }

      toast.success('Spray record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setSprayRecords, isOnline, onMutation]);

  // ─── Delete ─────────────────────────────────────────────────────────────────
  const deleteSprayRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

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
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
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

      let error, affectedRows;
      try {
        const res = await supabase
          .from('spray_records')
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
          console.error('Error deleting spray records:', error);
        } else {
          console.warn('Spray delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setSprayRecords(prev => {
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
  }, [farm_id, setSprayRecords, isOnline, onMutation]);

  return { addSprayRecord, updateSprayRecord, deleteSprayRecords };
}
