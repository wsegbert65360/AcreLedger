import { useCallback, useRef } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';

interface UseGrainMovementsArgs {
  farm_id: string | null;
  viewingSeason: number;
  grainMovements: GrainMovement[];
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

export function useGrainMovements({ farm_id, viewingSeason, grainMovements, setGrainMovements, isOnline, onMutation }: UseGrainMovementsArgs) {
  const isMutating = useRef(false);
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

    // Capture the prior row from the current render's state. The hook serializes
    // mutations (isMutating), so this is the true last-known row at edit time.
    // Reading it from the closure — instead of mutating a ref inside the state
    // setter — avoids depending on React's eager-update timing for correctness.
    const previous = grainMovements.find(item => item.id === r.id) ?? null;

    if (!previous) {
      // Record isn't in local state — can't optimistically update, lock, or roll
      // back safely. Abort rather than fabricate state.
      console.warn('Grain update aborted: record not present in local snapshot.', { id: r.id });
      isMutating.current = false;
      toast.error('Could not update record — refresh and try again.');
      return false;
    }

    // Optimistic update (previous is guaranteed non-null below).
    setGrainMovements(prev => prev.map(item => item.id === r.id ? r : item));

    // Concurrency guard: grain_movements has no version/updated_at column, so the
    // row's timestamp is the only last-known-state fingerprint. Only enforce it
    // when the timestamp is a usable fingerprint — a null/invalid stored timestamp
    // (safeTimestamp → 0) can't be matched, so enforcing it would permanently
    // block the row. Falling back to an unlocked update self-heals: the new value
    // carries a valid timestamp for the next edit.
    // (AGENTS.md: "Grain movement edits need a concurrency guard to prevent
    // ghost rows and inventory drift.")
    const hasUsableFingerprint = typeof previous.timestamp === 'number' && previous.timestamp > 0;
    const previousTimestampIso = hasUsableFingerprint ? new Date(previous.timestamp).toISOString() : null;

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
          setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const base = supabase
          .from('grain_movements')
          .update(payload, { count: 'exact' })
          .eq('id', r.id)
          .eq('farm_id', farm_id);
        // Only fingerprint when we have a usable timestamp (see note above).
        const res = previousTimestampIso
          ? await base.eq('timestamp', previousTimestampIso)
          : await base;
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
        } else if (previousTimestampIso) {
          // Zero rows matched the expected timestamp → concurrent edit on another
          // client/device. Roll back so the user doesn't silently overwrite it.
          console.warn('Grain update concurrency conflict detected.', {
            id: r.id,
            expectedTimestamp: previousTimestampIso,
          });
          toast.error('This movement changed elsewhere. Please refresh and try again.');
        } else {
          // No fingerprint guard and zero rows matched → the row was deleted or
          // changed on the server since we loaded it. Surface it rather than
          // silently treating a no-op as success.
          console.warn('Grain update affected zero rows (no fingerprint guard).', { id: r.id });
          toast.error('This movement could not be found. Please refresh and try again.');
        }
        setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, grainMovements, setGrainMovements, isOnline, onMutation]);

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
          // Atomic batch: a partial enqueue must not leave some deletions
          // queued while local state rolls back. enqueueMutations writes all
          // rows (web: single save; native: transactional executeSet) and rejects on any
          // failure so the catch below restores the full snapshot.
          await syncQueue.enqueueMutations(
            ids.map(id => ({
              tableName: 'grain_movements',
              operation: 'soft_delete' as const,
              payload: { id, deleted_at: deletedAt },
              farmId: farm_id,
            }))
          );
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
