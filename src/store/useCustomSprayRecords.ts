import { useCallback, useRef } from 'react';
import { CustomSprayRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapCustomSprayToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseCustomSprayRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  customSprayRecords: CustomSprayRecord[];
  setCustomSprayRecords: React.Dispatch<React.SetStateAction<CustomSprayRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function useCustomSprayRecords({ farm_id, viewingSeason, customSprayRecords, setCustomSprayRecords, isOnline, onMutation }: UseCustomSprayRecordsArgs) {
  const isMutating = useRef(false);
  const snapshotRef = useRef<{ record: CustomSprayRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addCustomSprayRecord = useCallback(async (
    r: Omit<CustomSprayRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: CustomSprayRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapCustomSprayToDb>;
    try {
      mapped = mapCustomSprayToDb(newRecord);
    } catch (err) {
      console.error('mapCustomSprayToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    setCustomSprayRecords(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('custom_spray_records', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Custom spray recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue custom spray record offline:', err);
          setCustomSprayRecords(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('custom_spray_records')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding custom spray record:', error);
        setCustomSprayRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save custom spray record.');
        return false;
      }

      toast.success('Custom spray recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setCustomSprayRecords, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateCustomSprayRecord = useCallback(async (r: CustomSprayRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapCustomSprayToDb>;
    try {
      mapped = mapCustomSprayToDb(r);
    } catch (err) {
      console.error('mapCustomSprayToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    const previous = customSprayRecords.find(item => item.id === r.id);
    if (!previous) {
      isMutating.current = false;
      toast.error('Could not update record — refresh and try again.');
      return false;
    }
    setCustomSprayRecords(prev => prev.map(item => item.id === r.id ? r : item));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('custom_spray_records', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Custom spray record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue custom spray record update offline:', err);
          if (previous) {
            setCustomSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
          } else {
            setCustomSprayRecords(prev => prev.filter(item => item.id !== r.id));
          }
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const res = await supabase
          .from('custom_spray_records')
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
          console.error('Error updating custom spray record:', error);
        } else {
          console.warn('Custom spray update affected zero rows:', r.id);
        }
        if (previous) {
          setCustomSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setCustomSprayRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record.');
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, customSprayRecords, setCustomSprayRecords, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteCustomSprayRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    snapshotRef.current = [];
    setCustomSprayRecords(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    try {
      if (!isOnline) {
        try {
          const deletedAt = new Date().toISOString();
          await syncQueue.enqueueMutations(ids.map(id => ({
            tableName: 'custom_spray_records', operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt }, farmId: farm_id,
          })));
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue custom spray record delete offline:', err);
          const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
          setCustomSprayRecords(prev => {
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
          .from('custom_spray_records')
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
          console.error('Error deleting custom spray records:', error);
        } else {
          console.warn('Custom spray delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setCustomSprayRecords(prev => {
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
  }, [farm_id, setCustomSprayRecords, isOnline, onMutation]);

  return { addCustomSprayRecord, updateCustomSprayRecord, deleteCustomSprayRecords };
}
