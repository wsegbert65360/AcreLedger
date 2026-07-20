import { useCallback, useRef } from 'react';
import { FertilizerApplication, Field } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapFertilizerToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseFertilizerRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  fields: Field[];
  fertilizerApplications: FertilizerApplication[];
  setFertilizerApplications: React.Dispatch<React.SetStateAction<FertilizerApplication[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

// ─── Internal Helper Hooks ──────────────────────────────────────────────────

function useAddFertilizerRecord({ farm_id, viewingSeason, fields, setFertilizerApplications, isOnline, onMutation }: UseFertilizerRecordsArgs) {
  const isMutating = useRef(false);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const addFertilizerApplication = useCallback(async (
    r: Omit<FertilizerApplication, 'id' | 'timestamp' | 'created_at' | 'updated_at' | 'fieldName' | 'deleted_at' | 'seasonYear' | 'farm_id'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const now = new Date();
    const newRecord: FertilizerApplication = {
      ...r,
      id,
      farm_id,
      timestamp: now.getTime(),
      deleted_at: null,
      fieldName: fieldsRef.current.find(f => f.id === r.fieldId)?.name || 'Unknown Field',
      seasonYear: viewingSeason
    };

    let mapped: ReturnType<typeof mapFertilizerToDb>;
    try {
      mapped = mapFertilizerToDb(newRecord);
    } catch (err) {
      console.error('mapFertilizerToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    setFertilizerApplications(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fertilizer_applications', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Fertilizer application recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue fertilizer record offline:', err);
          setFertilizerApplications(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('fertilizer_applications')
          .insert([{
            ...mapped,
            farm_id
          }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding fertilizer record:', error);
        setFertilizerApplications(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save fertilizer application.');
        return false;
      }

      toast.success('Fertilizer application recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setFertilizerApplications, isOnline, onMutation]);

  return { addFertilizerApplication };
}

function useUpdateFertilizerRecord({ farm_id, fields, fertilizerApplications, setFertilizerApplications, isOnline, onMutation }: Omit<UseFertilizerRecordsArgs, 'viewingSeason'>) {
  const isMutating = useRef(false);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const updateFertilizerApplication = useCallback(async (r: FertilizerApplication): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapFertilizerToDb>;
    try {
      mapped = mapFertilizerToDb(r);
    } catch (err) {
      console.error('mapFertilizerToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    const previous = fertilizerApplications.find(item => item.id === r.id);
    if (!previous) {
      isMutating.current = false;
      toast.error('Could not update record — refresh and try again.');
      return false;
    }
    const updatedRecord: FertilizerApplication = {
      ...r,
      fieldName: fieldsRef.current.find(f => f.id === r.fieldId)?.name || 'Unknown Field'
    };
    setFertilizerApplications(prev => prev.map(item => item.id === r.id ? updatedRecord : item));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fertilizer_applications', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Fertilizer application updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue fertilizer record update offline:', err);
          if (previous) {
            setFertilizerApplications(prev => prev.map(item => item.id === r.id ? previous : item));
          } else {
            setFertilizerApplications(prev => prev.filter(item => item.id !== r.id));
          }
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;

      let error, affectedRows;
      try {
        const res = await supabase
          .from('fertilizer_applications')
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
          console.error('Error updating fertilizer application:', error);
        } else {
          console.warn('Fertilizer update affected zero rows:', r.id);
        }
        
        if (previous) {
          setFertilizerApplications(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          console.warn('No previous record found for rollback, removing optimistic entry:', r.id);
          setFertilizerApplications(prev => prev.filter(item => item.id !== r.id));
        }
        
        toast.error('Failed to update fertilizer application.');
        return false;
      }

      toast.success('Fertilizer application updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, fertilizerApplications, setFertilizerApplications, isOnline, onMutation]);

  return { updateFertilizerApplication };
}

function useDeleteFertilizerRecord({ farm_id, setFertilizerApplications, isOnline, onMutation }: Pick<UseFertilizerRecordsArgs, 'farm_id' | 'setFertilizerApplications' | 'isOnline' | 'onMutation'>) {
  const isMutating = useRef(false);
  const snapshotRef = useRef<{ record: FertilizerApplication; index: number }[]>([]);

  const deleteFertilizerApplications = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    if (isMutating.current) return false;
    isMutating.current = true;

    snapshotRef.current = [];
    setFertilizerApplications(prev => {
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
            tableName: 'fertilizer_applications', operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt }, farmId: farm_id,
          })));
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue fertilizer record delete offline:', err);
          const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
          setFertilizerApplications(prev => {
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
          .from('fertilizer_applications')
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
          console.error('Error deleting fertilizer applications:', error);
        } else {
          console.warn('Fertilizer delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }

        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setFertilizerApplications(prev => {
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
  }, [farm_id, setFertilizerApplications, isOnline, onMutation]);

  return { deleteFertilizerApplications };
}

// ─── Public Hook ────────────────────────────────────────────────────────────

export function useFertilizerRecords(args: UseFertilizerRecordsArgs) {
  const { addFertilizerApplication } = useAddFertilizerRecord(args);
  const { updateFertilizerApplication } = useUpdateFertilizerRecord(args);
  const { deleteFertilizerApplications } = useDeleteFertilizerRecord(args);

  return { 
    addFertilizerApplication, 
    updateFertilizerApplication, 
    deleteFertilizerApplications 
  };
}
