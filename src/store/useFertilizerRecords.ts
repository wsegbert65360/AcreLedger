import { useCallback, useRef } from 'react';
import { FertilizerApplication, Field } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapFertilizerToDb } from '@/lib/mappers';

interface UseFertilizerRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  fields: Field[];
  setFertilizerApplications: React.Dispatch<React.SetStateAction<FertilizerApplication[]>>;
}

/** Returned by all three operations: true = committed, false = rolled back or blocked. */
type OpResult = boolean;

// ─── Internal Helper Hooks ──────────────────────────────────────────────────

function useAddFertilizerRecord({ farm_id, activeSeason, fields, setFertilizerApplications }: UseFertilizerRecordsArgs) {
  const isAdding = useRef(false);

  const addFertilizerApplication = useCallback(async (
    r: Omit<FertilizerApplication, 'id' | 'timestamp' | 'created_at' | 'updated_at' | 'fieldName' | 'deleted_at' | 'seasonYear'>
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (isAdding.current) return false;
    isAdding.current = true;

    const id = crypto.randomUUID();
    const now = new Date();
    const newRecord: FertilizerApplication = {
      ...r,
      id,
      timestamp: now.getTime(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted_at: null,
      fieldName: fields.find(f => f.id === r.fieldId)?.name || 'Unknown Field',
      seasonYear: activeSeason
    };

    let mapped: ReturnType<typeof mapFertilizerToDb>;
    try {
      mapped = mapFertilizerToDb(newRecord);
    } catch (err) {
      console.error('mapFertilizerToDb failed:', err);
      isAdding.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    setFertilizerApplications(prev => [...prev, newRecord]);

    try {
      const { error } = await supabase
        .from('fertilizer_applications')
        .insert([{
          ...mapped,
          farm_id
        }]);

      if (error) {
        console.error('Error adding fertilizer record:', error);
        setFertilizerApplications(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save fertilizer application.');
        return false;
      }

      toast.success('Fertilizer application recorded.');
      return true;
    } finally {
      isAdding.current = false;
    }
  }, [activeSeason, farm_id, fields, setFertilizerApplications]);

  return { addFertilizerApplication };
}

function useUpdateFertilizerRecord({ farm_id, fields, setFertilizerApplications }: Omit<UseFertilizerRecordsArgs, 'activeSeason'>) {
  const previousRef = useRef<FertilizerApplication | undefined>(undefined);

  const updateFertilizerApplication = useCallback(async (r: FertilizerApplication): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    let mapped: ReturnType<typeof mapFertilizerToDb>;
    try {
      mapped = mapFertilizerToDb(r);
    } catch (err) {
      console.error('mapFertilizerToDb failed:', err);
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    previousRef.current = undefined;
    const updatedAtIso = new Date().toISOString();
    setFertilizerApplications(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      const updatedRecord: FertilizerApplication = {
        ...r,
        updated_at: updatedAtIso,
        fieldName: fields.find(f => f.id === r.fieldId)?.name || 'Unknown Field'
      };
      return prev.map(item => item.id === r.id ? updatedRecord : item);
    });

    const { farm_id: _f, id: _i, ...payload } = mapped;

    const { error } = await supabase
      .from('fertilizer_applications')
      .update(payload)
      .eq('id', r.id)
      .eq('farm_id', farm_id);

    if (error) {
      console.error('Error updating fertilizer application:', error);
      
      const previous = previousRef.current;
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
  }, [farm_id, setFertilizerApplications, fields]);

  return { updateFertilizerApplication };
}

function useDeleteFertilizerRecord({ farm_id, setFertilizerApplications }: Pick<UseFertilizerRecordsArgs, 'farm_id' | 'setFertilizerApplications'>) {
  const snapshotRef = useRef<{ record: FertilizerApplication; index: number }[]>([]);

  const deleteFertilizerApplications = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (ids.length === 0) return true;

    snapshotRef.current = [];
    setFertilizerApplications(prev => {
      snapshotRef.current = prev
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => ids.includes(record.id));
      return prev.filter(r => !ids.includes(r.id));
    });

    const { error } = await supabase
      .from('fertilizer_applications')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);

    if (error) {
      console.error('Error deleting fertilizer applications:', error);

      // Restore records to their original positions. Sort ascending by index.
      const snapshot = [...snapshotRef.current].sort((a, b) => a.index - b.index);

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
  }, [farm_id, setFertilizerApplications]);

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
