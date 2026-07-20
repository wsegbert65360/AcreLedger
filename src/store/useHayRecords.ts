import { useCallback, useRef } from 'react';
import { HayHarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapHayToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseHayRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  hayHarvestRecords: HayHarvestRecord[];
  setHayHarvestRecords: React.Dispatch<React.SetStateAction<HayHarvestRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function useHayRecords({ farm_id, viewingSeason, hayHarvestRecords, setHayHarvestRecords, isOnline, onMutation }: UseHayRecordsArgs) {
  const isMutating = useRef(false);
  const snapshotRef = useRef<{ record: HayHarvestRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addHayHarvestRecord = useCallback(async (
    r: Omit<HayHarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: HayHarvestRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapHayToDb>;
    try {
      mapped = mapHayToDb(newRecord);
    } catch (err) {
      console.error('mapHayToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    setHayHarvestRecords(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('hay_harvest_records', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Hay harvest recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue hay harvest record offline:', err);
          setHayHarvestRecords(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('hay_harvest_records')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding hay harvest record:', error);
        setHayHarvestRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save hay harvest record.');
        return false;
      }

      toast.success('Hay harvest recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setHayHarvestRecords, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateHayHarvestRecord = useCallback(async (r: HayHarvestRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapHayToDb>;
    try {
      mapped = mapHayToDb(r);
    } catch (err) {
      console.error('mapHayToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    const previous = hayHarvestRecords.find(item => item.id === r.id);
    if (!previous) {
      isMutating.current = false;
      toast.error('Could not update record — refresh and try again.');
      return false;
    }
    setHayHarvestRecords(prev => prev.map(item => item.id === r.id ? r : item));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('hay_harvest_records', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Hay harvest record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue hay harvest record update offline:', err);
          if (previous) {
            setHayHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
          } else {
            setHayHarvestRecords(prev => prev.filter(item => item.id !== r.id));
          }
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const res = await supabase
          .from('hay_harvest_records')
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
          console.error('Error updating hay harvest record:', error);
        } else {
          console.warn('Hay harvest update affected zero rows:', r.id);
        }
        if (previous) {
          setHayHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setHayHarvestRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record.');
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, hayHarvestRecords, setHayHarvestRecords, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteHayHarvestRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    snapshotRef.current = [];
    setHayHarvestRecords(prev => {
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
            tableName: 'hay_harvest_records', operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt }, farmId: farm_id,
          })));
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue hay harvest record delete offline:', err);
          const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
          setHayHarvestRecords(prev => {
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
          .from('hay_harvest_records')
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
          console.error('Error deleting hay harvest records:', error);
        } else {
          console.warn('Hay delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }
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
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setHayHarvestRecords, isOnline, onMutation]);

  return { addHayHarvestRecord, updateHayHarvestRecord, deleteHayHarvestRecords };
}
