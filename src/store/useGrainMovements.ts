import { useCallback, useRef } from 'react';
import { GrainMovement } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainFromDb, mapGrainToDb } from '@/lib/mappers';
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

/**
 * Prefer an in-memory active IN linked to this harvest; when online and missing
 * locally, look up the authoritative leftover so a town→bin re-link updates
 * instead of inserting a second inventory row.
 */
async function resolveActiveHarvestInMovement(
  farmId: string,
  harvestRecordId: string,
  localMovements: GrainMovement[],
  isOnline: boolean,
): Promise<{ movement: GrainMovement | null; lookupFailed: boolean }> {
  const local = localMovements.find(gm =>
    !gm.deleted_at &&
    gm.type === 'in' &&
    gm.harvestRecordId === harvestRecordId
  );
  if (local) return { movement: local, lookupFailed: false };
  if (!isOnline) return { movement: null, lookupFailed: false };

  let data: unknown = null;
  let error: unknown = null;
  try {
    const res = await supabase
      .from('grain_movements')
      .select('*')
      .eq('farm_id', farmId)
      .eq('harvest_record_id', harvestRecordId)
      .is('deleted_at', null);
    data = res.data;
    error = res.error;
  } catch (err) {
    error = err;
  }

  if (error) {
    const { consolePayload } = describeSupabaseError(error);
    console.error('Failed to look up linked grain movement for harvest:', consolePayload);
    return { movement: null, lookupFailed: true };
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = rows.find((item: { type?: string }) => item.type === 'in') ?? rows[0];
  if (!row) return { movement: null, lookupFailed: false };
  return { movement: mapGrainFromDb(row as Parameters<typeof mapGrainFromDb>[0]), lookupFailed: false };
}

export function useGrainMovements({ farm_id, viewingSeason, grainMovements, setGrainMovements, isOnline, onMutation }: UseGrainMovementsArgs) {
  const isMutating = useRef(false);

  // ─── Update (shared by public update + harvest-link dedupe on add) ────────
  const applyGrainUpdate = useCallback(async (
    r: GrainMovement,
    previous: GrainMovement,
  ): Promise<OpResult> => {
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

    // Leftover INs discovered via harvest_record_id may not be in the local
    // snapshot yet. Seed on success path; on failure remove the hydrate.
    const wasLocal = grainMovements.some(item => item.id === previous.id);

    setGrainMovements(prev => {
      if (!prev.some(item => item.id === previous.id)) {
        return [...prev, r];
      }
      return prev.map(item => item.id === r.id ? r : item);
    });

    const rollback = () => {
      setGrainMovements(prev => {
        if (!wasLocal) {
          return prev.filter(item => item.id !== r.id);
        }
        return prev.map(item => item.id === r.id ? previous : item);
      });
    };

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
          rollback();
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
        rollback();
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

    const snapshot = grainMovements
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => ids.includes(record.id));
    setGrainMovements(prev => prev.filter(r => !ids.includes(r.id)));

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
          const rollbackSnapshot = [...snapshot].sort((a, b) => b.index - a.index);
          setGrainMovements(prev => {
            const restored = [...prev];
            for (const { record, index } of rollbackSnapshot) {
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
        const rollbackSnapshot = [...snapshot].sort((a, b) => b.index - a.index);
        setGrainMovements(prev => {
          const restored = [...prev];
          for (const { record, index } of rollbackSnapshot) {
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
  }, [farm_id, grainMovements, setGrainMovements, isOnline, onMutation]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addGrainMovement = useCallback(async (
    r: Omit<GrainMovement, 'id' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { timestamp?: number }
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    // One active IN per harvest: divert to update when a leftover already exists
    // (stale/empty local snapshot must not double bin inventory).
    if (r.harvestRecordId) {
      const { movement: existing, lookupFailed } = await resolveActiveHarvestInMovement(
        farm_id,
        r.harvestRecordId,
        grainMovements,
        isOnline,
      );
      if (lookupFailed) {
        toast.error('Could not verify linked grain movement. Try again.');
        return false;
      }
      if (existing) {
        const updated = await applyGrainUpdate({
          ...existing,
          binId: r.binId,
          binName: r.binName,
          bushels: r.bushels,
          moisturePercent: r.moisturePercent,
          sourceFieldName: r.sourceFieldName ?? existing.sourceFieldName,
          timestamp: r.timestamp ?? existing.timestamp,
          harvestRecordId: r.harvestRecordId,
          type: 'in',
        }, existing);
        if (!updated) return false;
        const leftoverTimestamp = r.timestamp ?? existing.timestamp;
        const leftoverSource = r.sourceFieldName ?? existing.sourceFieldName;
        const leftoverIds = leftoverSource == null ? [] : grainMovements
          .filter(gm =>
            gm.id !== existing.id &&
            !gm.deleted_at &&
            gm.type === 'in' &&
            !gm.harvestRecordId &&
            gm.sourceFieldName === leftoverSource &&
            gm.timestamp === leftoverTimestamp
          )
          .map(gm => gm.id);
        if (leftoverIds.length > 0) {
          await deleteGrainMovements(leftoverIds);
        }
        return true;
      }
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
  }, [viewingSeason, farm_id, grainMovements, setGrainMovements, isOnline, onMutation, applyGrainUpdate, deleteGrainMovements]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateGrainMovement = useCallback(async (r: GrainMovement): Promise<OpResult> => {
    // Capture the prior row from the current render's state. The hook serializes
    // mutations (isMutating), so this is the true last-known row at edit time.
    // Reading it from the closure — instead of mutating a ref inside the state
    // setter — avoids depending on React's eager-update timing for correctness.
    const previous = grainMovements.find(item => item.id === r.id) ?? null;

    if (!previous) {
      // Record isn't in local state — can't optimistically update, lock, or roll
      // back safely. Abort rather than fabricate state.
      console.warn('Grain update aborted: record not present in local snapshot.', { id: r.id });
      toast.error('Could not update record — refresh and try again.');
      return false;
    }

    return applyGrainUpdate(r, previous);
  }, [grainMovements, applyGrainUpdate]);

  return { addGrainMovement, updateGrainMovement, deleteGrainMovements };
}
