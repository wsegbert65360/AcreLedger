import { useCallback, useRef } from 'react';
import { PlantRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapPlantToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UsePlantRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  plantRecords: PlantRecord[];
  setPlantRecords: React.Dispatch<React.SetStateAction<PlantRecord[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function usePlantRecords({ farm_id, viewingSeason, plantRecords, setPlantRecords, isOnline, onMutation }: UsePlantRecordsArgs) {
  const isMutating = useRef(false);
  const snapshotRef = useRef<{ record: PlantRecord; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addPlantRecord = useCallback(async (
    r: Omit<PlantRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const newRecord: PlantRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapPlantToDb>;
    try {
      mapped = mapPlantToDb(newRecord);
    } catch (err) {
      console.error('mapPlantToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    setPlantRecords(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('plant_records', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Planting record saved offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue plant record offline:', err);
          setPlantRecords(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('plant_records')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding plant record:', error);
        setPlantRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save planting record.');
        return false;
      }

      toast.success('Planting record saved.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setPlantRecords, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updatePlantRecord = useCallback(async (r: PlantRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapPlantToDb>;
    try {
      mapped = mapPlantToDb(r);
    } catch (err) {
      console.error('mapPlantToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    const previous = plantRecords.find(item => item.id === r.id);
    if (!previous) {
      isMutating.current = false;
      toast.error('Could not update record — refresh and try again.');
      return false;
    }
    setPlantRecords(prev => prev.map(item => item.id === r.id ? r : item));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('plant_records', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue plant record update offline:', err);
          if (previous) {
            setPlantRecords(prev => prev.map(item => item.id === r.id ? previous : item));
          } else {
            setPlantRecords(prev => prev.filter(item => item.id !== r.id));
          }
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const res = await supabase
          .from('plant_records')
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
          console.error('Error updating plant record:', error);
        } else {
          console.warn('Plant update affected zero rows:', r.id);
        }
        if (previous) {
          setPlantRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          console.warn('No previous record found for rollback, removing optimistic entry:', r.id);
          setPlantRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record.');
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, plantRecords, setPlantRecords, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deletePlantRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    snapshotRef.current = [];
    setPlantRecords(prev => {
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
            tableName: 'plant_records', operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt }, farmId: farm_id,
          })));
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue plant record delete offline:', err);
          const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
          setPlantRecords(prev => {
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
          .from('plant_records')
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
          console.error('Error deleting plant records:', error);
        } else {
          console.warn('Plant delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setPlantRecords(prev => {
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
  }, [farm_id, setPlantRecords, isOnline, onMutation]);

  return { addPlantRecord, updatePlantRecord, deletePlantRecords };
}
