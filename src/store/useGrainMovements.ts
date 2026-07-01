import { useCallback, useRef } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseGrainMovementsArgs {
  farm_id: string | null;
  viewingSeason: number;
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

/**
 * Extract the actual PostgREST error details so failures are diagnosable.
 * Supabase errors carry { code, message, details, hint } — surfacing these
 * (instead of a generic toast) is what reveals schema/constraint problems
 * like "PGRST204: Could not find the 'X' column in the schema cache".
 */
function describeSupabaseError(error: unknown): { consolePayload: unknown; toastOptions?: { description: string } } {
  const e = (error ?? {}) as { code?: string; message?: string; details?: string; hint?: string };
  const code = e.code;
  const message = e.message;
  const label = [code, message].filter(Boolean).join(': ') || 'Unknown error';
  return {
    consolePayload: { code, message, details: e.details, hint: e.hint },
    toastOptions: { description: label },
  };
}

export function useGrainMovements({ farm_id, viewingSeason, setGrainMovements, isOnline, onMutation }: UseGrainMovementsArgs) {
  const isMutating = useRef(false);
  const previousRef = useRef<GrainMovement | undefined>(undefined);
  const snapshotRef = useRef<{ record: GrainMovement; index: number }[]>([]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addGrainMovement = useCallback(async (
    r: Omit<GrainMovement, 'id' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { timestamp?: number }
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const id = crypto.randomUUID();
    const timestamp = r.timestamp || Date.now();
    const newRecord: GrainMovement = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapGrainToDb>;
    try {
      mapped = mapGrainToDb(newRecord);
    } catch (err) {
      console.error('mapGrainToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    setGrainMovements(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('grain_movements', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Grain movement recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue grain movement record offline:', err);
          setGrainMovements(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('grain_movements')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        const { consolePayload, toastOptions } = describeSupabaseError(error);
        console.error('Error adding grain movement record:', consolePayload);
        setGrainMovements(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save grain movement.', toastOptions);
        return false;
      }

      toast.success('Grain movement recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setGrainMovements, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateGrainMovement = useCallback(async (r: GrainMovement): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapGrainToDb>;
    try {
      mapped = mapGrainToDb(r);
    } catch (err) {
      console.error('mapGrainToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check your inputs.');
      return false;
    }

    previousRef.current = undefined;
    setGrainMovements(prev => {
      previousRef.current = prev.find(item => item.id === r.id);
      return prev.map(item => item.id === r.id ? r : item);
    });

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('grain_movements', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Grain movement record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue grain movement record update offline:', err);
          const previous = previousRef.current;
          if (previous) {
            setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
          } else {
            setGrainMovements(prev => prev.filter(item => item.id !== r.id));
          }
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const res = await supabase
          .from('grain_movements')
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
          const { consolePayload, toastOptions } = describeSupabaseError(error);
          console.error('Error updating grain movement:', consolePayload);
          toast.error('Failed to update record.', toastOptions);
        } else {
          console.warn('Grain update affected zero rows:', r.id);
          toast.error('Failed to update record.', { description: 'Record was not found or already changed.' });
        }
        const previous = previousRef.current;
        if (previous) {
          setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setGrainMovements(prev => prev.filter(item => item.id !== r.id));
        }
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setGrainMovements, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteGrainMovements = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    snapshotRef.current = [];
    setGrainMovements(prev => {
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
            await syncQueue.enqueueMutation('grain_movements', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
          }
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue grain movement record delete offline:', err);
          const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
          setGrainMovements(prev => {
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
          .from('grain_movements')
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
          const { consolePayload, toastOptions } = describeSupabaseError(error);
          console.error('Error deleting grain movements:', consolePayload);
          toast.error('Failed to delete records.', toastOptions);
        } else {
          console.warn('Grain delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
          toast.error('Failed to delete records.', { description: `${affectedRows ?? 0} of ${ids.length} record(s) were found.` });
        }
        const snapshot = [...snapshotRef.current].sort((a, b) => b.index - a.index);
        setGrainMovements(prev => {
          const restored = [...prev];
          for (const { record, index } of snapshot) {
            const insertAt = Math.min(index, restored.length);
            restored.splice(insertAt, 0, record);
          }
          return restored;
        });
        return false;
      }

      const count = ids.length;
      toast.success(`${count} record${count !== 1 ? 's' : ''} deleted.`);
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, setGrainMovements, isOnline, onMutation]);

  return { addGrainMovement, updateGrainMovement, deleteGrainMovements };
}
