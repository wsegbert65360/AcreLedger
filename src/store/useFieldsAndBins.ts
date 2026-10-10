import { useCallback, useRef } from 'react';
import { Field, Bin, SavedSeed, SprayRecipe, FertilizerRecipe } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { fieldService } from '@/services/fieldService';
import { binService } from '@/services/binService';
import { mapFieldToDb, mapBinToDb, mapSeedToDb, mapRecipeToDb, mapFertilizerRecipeToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';
import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';
import type { FieldCluAssignment } from '@/types/fsaTract';

function restoreAtIndex<T>(
  setItems: React.Dispatch<React.SetStateAction<T[]>>,
  item: T | undefined,
  index: number,
): void {
  if (!item) return;
  setItems(prev => {
    const restored = [...prev];
    restored.splice(Math.min(Math.max(0, index), restored.length), 0, item);
    return restored;
  });
}

interface UseFieldsAndBinsArgs {
  farm_id: string | null;
  fields: Field[];
  bins: Bin[];
  savedSeeds: SavedSeed[];
  sprayRecipes: SprayRecipe[];
  fertilizerRecipes: FertilizerRecipe[];
  cluAssignments: FieldCluAssignment[];
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  setBins: React.Dispatch<React.SetStateAction<Bin[]>>;
  setSavedSeeds: React.Dispatch<React.SetStateAction<SavedSeed[]>>;
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
  setFertilizerRecipes: React.Dispatch<React.SetStateAction<FertilizerRecipe[]>>;
  setCluAssignments: React.Dispatch<React.SetStateAction<FieldCluAssignment[]>>;
  isOnline: boolean;
  onMutation?: () => void | Promise<void>;
}

export function useFieldsAndBins({
  farm_id, fields, bins, savedSeeds, sprayRecipes, fertilizerRecipes, cluAssignments,
  setFields, setBins,
  setSavedSeeds, setSprayRecipes,
  setFertilizerRecipes, setCluAssignments,
  isOnline, onMutation
}: UseFieldsAndBinsArgs) {
  // Guards to prevent double-taps on operations
  const isFieldMutating = useRef(false);
  const isBinMutating = useRef(false);
  const isSeedMutating = useRef(false);
  const isRecipeMutating = useRef(false);

  // Settles when the in-flight field update finishes. The FieldNotes unmount
  // flush (flushFieldNotes) awaits it so a cleanup save lands strictly after
  // an in-flight autosave instead of being rejected by the isFieldMutating
  // guard — that rejection lost newer keystrokes while the older draft persisted.
  const fieldMutationPromiseRef = useRef<Promise<void> | null>(null);

  // --- Fields ---
  const addField = useCallback(async (f: Omit<Field, 'id' | 'farm_id'>, requestedId?: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isFieldMutating.current) {
      toast.error('Field operation in progress. Please try again.');
      return false;
    }
    isFieldMutating.current = true;

    const id = requestedId ?? crypto.randomUUID();
    const newField: Field = { ...f, id, farm_id };
    
    let mapped: ReturnType<typeof mapFieldToDb>;
    try {
      mapped = mapFieldToDb(newField);
    } catch (err) {
      console.error('mapFieldToDb failed:', err);
      toast.error('Failed to prepare field — check inputs.');
      isFieldMutating.current = false;
      return false;
    }

    setFields(prev => [...prev, newField]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fields', 'insert', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Field created offline!');
          return true;
        } catch (err) {
          console.error('Failed to enqueue add field offline:', err);
          setFields(prev => prev.filter(field => field.id !== id));
          toast.error('Failed to save field offline');
          return false;
        }
      }

      try {
        const { error } = await fieldService.createField(f, id, farm_id);
        if (error) {
          if (isUnknownMutationOutcome(error)) {
            console.warn('Field add outcome unknown; preserving record and queueing for reconcile:', error);
            try {
              await syncQueue.enqueueMutation('fields', 'insert', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Field saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue field after unknown outcome:', enqueueErr);
              setFields(prev => prev.filter(field => field.id !== id));
              toast.error('Failed to save field');
              return false;
            }
          }
          console.error('Supabase error adding field:', error);
          setFields(prev => prev.filter(field => field.id !== id));
          toast.error('Failed to save field');
          return false;
        }
        toast.success('Field created!');
        return true;
      } catch (err) {
        // Network error: request may have committed. Preserve and queue.
        if (isUnknownMutationOutcome(err)) {
          console.warn('Field add network outcome unknown; preserving record and queueing:', err);
          try {
            await syncQueue.enqueueMutation('fields', 'insert', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Field saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue field after network error:', enqueueErr);
          }
        }
        console.error('Network error adding field:', err);
        setFields(prev => prev.filter(field => field.id !== id));
        toast.error('Failed to save field due to a network error');
        return false;
      }
    } finally {
      isFieldMutating.current = false;
    }
  }, [farm_id, setFields, isOnline, onMutation]);

  const updateField = useCallback(async (f: Field): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isFieldMutating.current) {
      toast.error('Field operation in progress. Please try again.');
      return false;
    }
    isFieldMutating.current = true;

    // Deferred that settles when this mutation finishes, letting the FieldNotes
    // unmount flush serialize behind it (see flushFieldNotes).
    let resolveFieldMutation: () => void = () => {};
    fieldMutationPromiseRef.current = new Promise<void>(resolve => {
      resolveFieldMutation = resolve;
    });
    // Clears the guard and settles the deferred. State is settled synchronously
    // before resolving so a chained flush resuming on the resolve sees the
    // guard already released.
    const settleFieldMutation = () => {
      isFieldMutating.current = false;
      fieldMutationPromiseRef.current = null;
      resolveFieldMutation();
    };

    let mapped: ReturnType<typeof mapFieldToDb>;
    try {
      mapped = mapFieldToDb({ ...f, farm_id });
    } catch (err) {
      console.error('mapFieldToDb failed:', err);
      toast.error('Failed to prepare field — check inputs.');
      settleFieldMutation();
      return false;
    }

    // Capture the prior record from the current render's state. The hook serializes
    // mutations (isFieldMutating), so this is the true last-known record at edit
    // time. Reading it from the closure — instead of mutating a variable inside
    // the state setter — avoids depending on React's eager-update timing for
    // rollback correctness (same pattern as useGrainMovements).
    const previous = fields.find(item => item.id === f.id);

    setFields(prev => prev.map(existing => existing.id === f.id ? f : existing));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fields', 'update', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Field updated offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue update field offline:', err);
          if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
          toast.error('Failed to update field offline');
          return false;
        }
      }

      try {
        const { count: affectedRows, error } = await fieldService.updateField(f, farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Field update outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('fields', 'update', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Field saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue field update after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Supabase error updating field:', error);
          } else {
            console.warn('Field update affected zero rows:', f.id);
          }
          if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
          toast.error('Failed to update field');
          return false;
        }
        toast.success('Field updated');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Field update network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('fields', 'update', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Field saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue field update after network error:', enqueueErr);
          }
        }
        console.error('Network error updating field:', err);
        if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
        toast.error('Failed to update field due to a network error');
        return false;
      }
    } finally {
      settleFieldMutation();
    }
  }, [farm_id, fields, setFields, isOnline, onMutation]);

  // Notes-only save used by the FieldNotes unmount cleanup. Waits for any
  // in-flight field update (typically a debounce autosave carrying an older
  // draft) to settle, then saves through the normal updateField path. This
  // closes the race where the cleanup flush was rejected by the
  // isFieldMutating guard and newer keystrokes were lost. Out of scope: a
  // field add/delete in flight from another screen still holds the guard, in
  // which case this returns false exactly as the old direct call did.
  const flushFieldNotes = useCallback(async (f: Field): Promise<boolean> => {
    const inFlight = fieldMutationPromiseRef.current;
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        // A failed autosave must not block the flush; updateField's own
        // failure paths (rollback, queue, toasts) still apply below.
      }
    }
    return updateField(f);
  }, [updateField]);

  const deleteField = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isFieldMutating.current) {
      toast.error('Field operation in progress. Please try again.');
      return false;
    }
    isFieldMutating.current = true;

    // Capture the prior record from the closure (see updateField note).
    const previous = fields.find(f => f.id === id);
    const assignmentsToDelete = cluAssignments.filter(a => a.fieldId === id && !a.deletedAt);
    const deletedAt = new Date().toISOString();
    setFields(prev => prev.map(f =>
      f.id === id ? { ...f, deleted_at: deletedAt } : f
    ));
    setCluAssignments(prev => prev.map(a =>
      a.fieldId === id && !a.deletedAt ? { ...a, deletedAt } : a
    ));
    // Restore only this field's rows: a whole-array snapshot would also revert
    // CLU assignments that a concurrent useFsaTracts mutation persisted while
    // this delete was awaiting its request.
    const rollbackAssignments = () => setCluAssignments(prev => prev.map(a => {
      const original = assignmentsToDelete.find(t => t.id === a.id);
      return original ?? a;
    }));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutations([
            ...assignmentsToDelete.map(a => ({
              tableName: 'field_clu_assignments',
              operation: 'soft_delete' as const,
              payload: { id: a.id, deleted_at: deletedAt },
              farmId: farm_id,
            })),
            {
              tableName: 'fields',
              operation: 'soft_delete',
              payload: { id, deleted_at: deletedAt },
              farmId: farm_id,
            },
          ]);
          if (onMutation) await onMutation();
          toast.success('Field deleted offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue delete field offline:', err);
          if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
          rollbackAssignments();
          toast.error('Failed to delete field offline');
          return false;
        }
      }

      try {
        const { count: affectedRows, error } = await fieldService.softDeleteField(id, farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Field delete outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutations([
                ...assignmentsToDelete.map(a => ({
                  tableName: 'field_clu_assignments',
                  operation: 'soft_delete' as const,
                  payload: { id: a.id, deleted_at: deletedAt },
                  farmId: farm_id,
                })),
                {
                  tableName: 'fields',
                  operation: 'soft_delete' as const,
                  payload: { id, deleted_at: deletedAt },
                  farmId: farm_id,
                },
              ]);
              if (onMutation) await onMutation();
              toast.success('Field deleted locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue field delete after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error deleting field:', error);
          } else {
            console.warn('Field delete affected zero rows:', id);
          }
          if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
          rollbackAssignments();
          toast.error('Failed to delete field');
          return false;
        }
        toast.success('Field deleted');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Field delete network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutations([
              ...assignmentsToDelete.map(a => ({
                tableName: 'field_clu_assignments',
                operation: 'soft_delete' as const,
                payload: { id: a.id, deleted_at: deletedAt },
                farmId: farm_id,
              })),
              {
                tableName: 'fields',
                operation: 'soft_delete' as const,
                payload: { id, deleted_at: deletedAt },
                farmId: farm_id,
              },
            ]);
            if (onMutation) await onMutation();
            toast.success('Field deleted locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue field delete after network error:', enqueueErr);
          }
        }
        console.error('Network error deleting field:', err);
        if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
        rollbackAssignments();
        toast.error('Failed to delete field due to a network error');
        return false;
      }
    } finally {
      isFieldMutating.current = false;
    }
  }, [
    farm_id, fields, cluAssignments, setFields, setCluAssignments,
    isOnline, onMutation,
  ]);

  // --- Bins ---
  const addBin = useCallback(async (b: Omit<Bin, 'id' | 'farm_id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isBinMutating.current) {
      toast.error('Bin operation in progress. Please try again.');
      return false;
    }
    isBinMutating.current = true;

    const id = crypto.randomUUID();
    const newBin: Bin = { ...b, id, farm_id };

    let mapped: ReturnType<typeof mapBinToDb>;
    try {
      mapped = mapBinToDb(newBin);
    } catch (err) {
      console.error('mapBinToDb failed:', err);
      toast.error('Failed to prepare bin — check inputs.');
      isBinMutating.current = false;
      return false;
    }

    setBins(prev => [...prev, newBin]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('bins', 'insert', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Bin created offline!');
          return true;
        } catch (err) {
          console.error('Failed to enqueue add bin offline:', err);
          setBins(prev => prev.filter(bin => bin.id !== id));
          toast.error('Failed to save bin offline');
          return false;
        }
      }

      try {
        const { error } = await binService.createBin(b, id, farm_id);
        if (error) {
          if (isUnknownMutationOutcome(error)) {
            console.warn('Bin add outcome unknown; preserving record and queueing for reconcile:', error);
            try {
              await syncQueue.enqueueMutation('bins', 'insert', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Bin saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue bin after unknown outcome:', enqueueErr);
              setBins(prev => prev.filter(bin => bin.id !== id));
              toast.error('Failed to save bin');
              return false;
            }
          }
          console.error('Error adding bin:', error);
          setBins(prev => prev.filter(bin => bin.id !== id));
          toast.error('Failed to save bin');
          return false;
        }
        toast.success('Bin created!');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Bin add network outcome unknown; preserving record and queueing:', err);
          try {
            await syncQueue.enqueueMutation('bins', 'insert', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Bin saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue bin after network error:', enqueueErr);
          }
        }
        console.error('Network error adding bin:', err);
        setBins(prev => prev.filter(bin => bin.id !== id));
        toast.error('Failed to save bin due to a network error');
        return false;
      }
    } finally {
      isBinMutating.current = false;
    }
  }, [farm_id, setBins, isOnline, onMutation]);

  const updateBin = useCallback(async (b: Bin): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isBinMutating.current) {
      toast.error('Bin operation in progress. Please try again.');
      return false;
    }
    isBinMutating.current = true;

    let mapped: ReturnType<typeof mapBinToDb>;
    try {
      mapped = mapBinToDb({ ...b, farm_id });
    } catch (err) {
      console.error('mapBinToDb failed:', err);
      toast.error('Failed to prepare bin — check inputs.');
      isBinMutating.current = false;
      return false;
    }

    // Capture the prior record from the closure (see updateField note).
    const previous = bins.find(item => item.id === b.id);
    setBins(prev => prev.map(existing => existing.id === b.id ? b : existing));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('bins', 'update', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Bin updated offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue update bin offline:', err);
          if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
          toast.error('Failed to update bin offline');
          return false;
        }
      }

      try {
        const { count: affectedRows, error } = await binService.updateBin(b, farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Bin update outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('bins', 'update', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Bin saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue bin update after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error updating bin:', error);
          } else {
            console.warn('Bin update affected zero rows:', b.id);
          }
          if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
          toast.error('Failed to update bin');
          return false;
        }
        toast.success('Bin updated');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Bin update network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('bins', 'update', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Bin saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue bin update after network error:', enqueueErr);
          }
        }
        console.error('Network error updating bin:', err);
        if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
        toast.error('Failed to update bin due to a network error');
        return false;
      }
    } finally {
      isBinMutating.current = false;
    }
  }, [farm_id, bins, setBins, isOnline, onMutation]);

  const deleteBin = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isBinMutating.current) {
      toast.error('Bin operation in progress. Please try again.');
      return false;
    }
    isBinMutating.current = true;

    // Capture the prior record from the closure (see updateField note).
    const previous = bins.find(b => b.id === id);
    const deletedAt = new Date().toISOString();
    setBins(prev => prev.map(b =>
      b.id === id ? { ...b, deleted_at: deletedAt } : b
    ));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('bins', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Bin deleted offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue delete bin offline:', err);
          if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
          toast.error('Failed to delete bin offline');
          return false;
        }
      }

      try {
        const { count: affectedRows, error } = await binService.softDeleteBin(id, farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Bin delete outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('bins', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
              if (onMutation) await onMutation();
              toast.success('Bin deleted locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue bin delete after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error deleting bin:', error);
          } else {
            console.warn('Bin delete affected zero rows:', id);
          }
          if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
          toast.error('Failed to delete bin');
          return false;
        }
        toast.success('Bin deleted');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Bin delete network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('bins', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
            if (onMutation) await onMutation();
            toast.success('Bin deleted locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue bin delete after network error:', enqueueErr);
          }
        }
        console.error('Network error deleting bin:', err);
        if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
        toast.error('Failed to delete bin due to a network error');
        return false;
      }
    } finally {
      isBinMutating.current = false;
    }
  }, [farm_id, bins, setBins, isOnline, onMutation]);

  // --- Seeds ---
  const addSeed = useCallback(async (name: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isSeedMutating.current) {
      toast.error('Seed operation in progress. Please try again.');
      return false;
    }
    isSeedMutating.current = true;

    const id = crypto.randomUUID();
    const newSeed: SavedSeed = { 
      id, name, farm_id, deleted_at: null,
      crop: '—', variety: '—', supplier: '—', lotNumber: '—', 
      year: new Date().getFullYear(), notes: '' 
    };

    let mapped: ReturnType<typeof mapSeedToDb>;
    try {
      mapped = mapSeedToDb(newSeed);
    } catch (err) {
      console.error('mapSeedToDb failed:', err);
      toast.error('Failed to prepare seed — check inputs.');
      isSeedMutating.current = false;
      return false;
    }

    setSavedSeeds(prev => [...prev, newSeed]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('saved_seeds', 'insert', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Seed variety added offline!');
          return true;
        } catch (err) {
          console.error('Failed to enqueue add seed offline:', err);
          setSavedSeeds(prev => prev.filter(s => s.id !== id));
          toast.error('Failed to save seed offline');
          return false;
        }
      }

      try {
        const { error } = await supabase.from('saved_seeds').insert([mapped]);
        if (error) {
          if (isUnknownMutationOutcome(error)) {
            console.warn('Seed add outcome unknown; preserving record and queueing for reconcile:', error);
            try {
              await syncQueue.enqueueMutation('saved_seeds', 'insert', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Seed variety saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue seed after unknown outcome:', enqueueErr);
              setSavedSeeds(prev => prev.filter(s => s.id !== id));
              toast.error('Failed to save seed');
              return false;
            }
          }
          console.error('Error adding seed:', error);
          setSavedSeeds(prev => prev.filter(s => s.id !== id));
          toast.error('Failed to save seed');
          return false;
        }
        toast.success('Seed variety added!');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Seed add network outcome unknown; preserving record and queueing:', err);
          try {
            await syncQueue.enqueueMutation('saved_seeds', 'insert', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Seed variety saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue seed after network error:', enqueueErr);
          }
        }
        console.error('Network error adding seed:', err);
        setSavedSeeds(prev => prev.filter(s => s.id !== id));
        toast.error('Failed to save seed due to a network error');
        return false;
      }
    } finally {
      isSeedMutating.current = false;
    }
  }, [farm_id, setSavedSeeds, isOnline, onMutation]);

  const deleteSeed = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isSeedMutating.current) {
      toast.error('Seed operation in progress. Please try again.');
      return false;
    }
    isSeedMutating.current = true;

    // Capture the prior record from the closure (see updateField note).
    const previousIndex = savedSeeds.findIndex(s => s.id === id);
    const previous = previousIndex >= 0 ? savedSeeds[previousIndex] : undefined;
    const deletedAt = new Date().toISOString();
    setSavedSeeds(prev => prev.filter(s => s.id !== id));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('saved_seeds', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Seed variety removed offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue delete seed offline:', err);
          restoreAtIndex(setSavedSeeds, previous, previousIndex);
          toast.error('Failed to remove seed offline');
          return false;
        }
      }

      try {
        const { error, count: affectedRows } = await supabase
          .from('saved_seeds')
          .update({ deleted_at: deletedAt }, { count: 'exact' })
          .eq('id', id)
          .eq('farm_id', farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Seed delete outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('saved_seeds', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
              if (onMutation) await onMutation();
              toast.success('Seed variety removed locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue seed delete after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error deleting seed:', error);
          } else {
            console.warn('Seed delete affected zero rows:', id);
          }
          restoreAtIndex(setSavedSeeds, previous, previousIndex);
          toast.error('Failed to delete seed');
          return false;
        }
        toast.success('Seed variety removed');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Seed delete network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('saved_seeds', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
            if (onMutation) await onMutation();
            toast.success('Seed variety removed locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue seed delete after network error:', enqueueErr);
          }
        }
        console.error('Network error deleting seed:', err);
        restoreAtIndex(setSavedSeeds, previous, previousIndex);
        toast.error('Failed to delete seed due to a network error');
        return false;
      }
    } finally {
      isSeedMutating.current = false;
    }
  }, [farm_id, savedSeeds, setSavedSeeds, isOnline, onMutation]);

  // --- Spray Recipes ---
  const addSprayRecipe = useCallback(async (r: Omit<SprayRecipe, 'id' | 'farm_id' | 'deleted_at'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isRecipeMutating.current) {
      toast.error('Recipe operation in progress. Please try again.');
      return false;
    }
    isRecipeMutating.current = true;

    const id = crypto.randomUUID();
    const newRecipe: SprayRecipe = { ...r, id, farm_id, deleted_at: null };

    let mapped: ReturnType<typeof mapRecipeToDb>;
    try {
      mapped = mapRecipeToDb(newRecipe);
    } catch (err) {
      console.error('mapRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      isRecipeMutating.current = false;
      return false;
    }

    setSprayRecipes(prev => [...prev, newRecipe]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('spray_recipes', 'insert', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Spray recipe created offline!');
          return true;
        } catch (err) {
          console.error('Failed to enqueue add spray recipe offline:', err);
          setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save recipe offline');
          return false;
        }
      }

      try {
        const { error } = await supabase.from('spray_recipes').insert([mapped]);
        if (error) {
          if (isUnknownMutationOutcome(error)) {
            console.warn('Spray recipe add outcome unknown; preserving record and queueing for reconcile:', error);
            try {
              await syncQueue.enqueueMutation('spray_recipes', 'insert', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Spray recipe saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue spray recipe after unknown outcome:', enqueueErr);
              setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
              toast.error('Failed to save recipe');
              return false;
            }
          }
          console.error('Error adding spray recipe:', error);
          setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save recipe');
          return false;
        }
        toast.success('Spray recipe created!');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Spray recipe add network outcome unknown; preserving record and queueing:', err);
          try {
            await syncQueue.enqueueMutation('spray_recipes', 'insert', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Spray recipe saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue spray recipe after network error:', enqueueErr);
          }
        }
        console.error('Network error adding spray recipe:', err);
        setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save recipe due to a network error');
        return false;
      }
    } finally {
      isRecipeMutating.current = false;
    }
  }, [farm_id, setSprayRecipes, isOnline, onMutation]);

  const updateSprayRecipe = useCallback(async (r: SprayRecipe): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isRecipeMutating.current) {
      toast.error('Recipe operation in progress. Please try again.');
      return false;
    }
    isRecipeMutating.current = true;

    let mapped: ReturnType<typeof mapRecipeToDb>;
    try {
      mapped = mapRecipeToDb({ ...r, farm_id });
    } catch (err) {
      console.error('mapRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      isRecipeMutating.current = false;
      return false;
    }

    // Capture the prior record from the closure (see updateField note).
    const previous = sprayRecipes.find(item => item.id === r.id);
    setSprayRecipes(prev => prev.map(existing => existing.id === r.id ? r : existing));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('spray_recipes', 'update', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Spray recipe updated offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue update spray recipe offline:', err);
          if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
          toast.error('Failed to update recipe offline');
          return false;
        }
      }

      try {
        const { farm_id: _f, id: _i, ...payload } = mapped;
        const { error, count: affectedRows } = await supabase
          .from('spray_recipes')
          .update(payload, { count: 'exact' })
          .eq('id', r.id)
          .eq('farm_id', farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Spray recipe update outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('spray_recipes', 'update', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Spray recipe saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue spray recipe update after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error updating spray recipe:', error);
          } else {
            console.warn('Spray recipe update affected zero rows:', r.id);
          }
          if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
          toast.error('Failed to update recipe');
          return false;
        }
        toast.success('Recipe updated');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Spray recipe update network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('spray_recipes', 'update', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Spray recipe saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue spray recipe update after network error:', enqueueErr);
          }
        }
        console.error('Network error updating spray recipe:', err);
        if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
        toast.error('Failed to update recipe due to a network error');
        return false;
      }
    } finally {
      isRecipeMutating.current = false;
    }
  }, [farm_id, sprayRecipes, setSprayRecipes, isOnline, onMutation]);

  const deleteSprayRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isRecipeMutating.current) {
      toast.error('Recipe operation in progress. Please try again.');
      return false;
    }
    isRecipeMutating.current = true;

    // Capture the prior record from the closure (see updateField note).
    const previousIndex = sprayRecipes.findIndex(r => r.id === id);
    const previous = previousIndex >= 0 ? sprayRecipes[previousIndex] : undefined;
    const deletedAt = new Date().toISOString();
    setSprayRecipes(prev => prev.filter(r => r.id !== id));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('spray_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Recipe removed offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue delete spray recipe offline:', err);
          restoreAtIndex(setSprayRecipes, previous, previousIndex);
          toast.error('Failed to delete recipe offline');
          return false;
        }
      }

      try {
        const { error, count: affectedRows } = await supabase
          .from('spray_recipes')
          .update({ deleted_at: deletedAt }, { count: 'exact' })
          .eq('id', id)
          .eq('farm_id', farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Spray recipe delete outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('spray_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
              if (onMutation) await onMutation();
              toast.success('Recipe removed locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue spray recipe delete after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error deleting spray recipe:', error);
          } else {
            console.warn('Spray recipe delete affected zero rows:', id);
          }
          restoreAtIndex(setSprayRecipes, previous, previousIndex);
          toast.error('Failed to delete recipe');
          return false;
        }
        toast.success('Recipe removed');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Spray recipe delete network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('spray_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
            if (onMutation) await onMutation();
            toast.success('Recipe removed locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue spray recipe delete after network error:', enqueueErr);
          }
        }
        console.error('Network error deleting spray recipe:', err);
        restoreAtIndex(setSprayRecipes, previous, previousIndex);
        toast.error('Failed to delete recipe due to a network error');
        return false;
      }
    } finally {
      isRecipeMutating.current = false;
    }
  }, [farm_id, sprayRecipes, setSprayRecipes, isOnline, onMutation]);

  // --- Fertilizer Recipes ---
  const addFertilizerRecipe = useCallback(async (r: Omit<FertilizerRecipe, 'id' | 'farm_id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isRecipeMutating.current) {
      toast.error('Recipe operation in progress. Please try again.');
      return false;
    }
    isRecipeMutating.current = true;

    const id = crypto.randomUUID();
    const newRecipe: FertilizerRecipe = { ...r, id, farm_id, deleted_at: null };

    let mapped: ReturnType<typeof mapFertilizerRecipeToDb>;
    try {
      mapped = mapFertilizerRecipeToDb(newRecipe);
    } catch (err) {
      console.error('mapFertilizerRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      isRecipeMutating.current = false;
      return false;
    }

    setFertilizerRecipes(prev => [...prev, newRecipe]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fertilizer_recipes', 'insert', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Fertilizer recipe created offline!');
          return true;
        } catch (err) {
          console.error('Failed to enqueue add fertilizer recipe offline:', err);
          setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save recipe offline');
          return false;
        }
      }

      try {
        const { error } = await supabase.from('fertilizer_recipes').insert([mapped]);
        if (error) {
          if (isUnknownMutationOutcome(error)) {
            console.warn('Fertilizer recipe add outcome unknown; preserving record and queueing for reconcile:', error);
            try {
              await syncQueue.enqueueMutation('fertilizer_recipes', 'insert', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Fertilizer recipe saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue fertilizer recipe after unknown outcome:', enqueueErr);
              setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
              toast.error('Failed to save recipe');
              return false;
            }
          }
          console.error('Error adding fertilizer recipe:', error);
          setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save recipe');
          return false;
        }
        toast.success('Fertilizer recipe created!');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Fertilizer recipe add network outcome unknown; preserving record and queueing:', err);
          try {
            await syncQueue.enqueueMutation('fertilizer_recipes', 'insert', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Fertilizer recipe saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue fertilizer recipe after network error:', enqueueErr);
          }
        }
        console.error('Network error adding fertilizer recipe:', err);
        setFertilizerRecipes(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save recipe due to a network error');
        return false;
      }
    } finally {
      isRecipeMutating.current = false;
    }
  }, [farm_id, setFertilizerRecipes, isOnline, onMutation]);

  const updateFertilizerRecipe = useCallback(async (r: Omit<FertilizerRecipe, 'farm_id'>): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isRecipeMutating.current) {
      toast.error('Recipe operation in progress. Please try again.');
      return false;
    }
    isRecipeMutating.current = true;

    const updatedRecipe: FertilizerRecipe = { ...r, farm_id };
    let mapped: ReturnType<typeof mapFertilizerRecipeToDb>;
    try {
      mapped = mapFertilizerRecipeToDb(updatedRecipe);
    } catch (err) {
      console.error('mapFertilizerRecipeToDb failed:', err);
      toast.error('Failed to prepare recipe — check inputs.');
      isRecipeMutating.current = false;
      return false;
    }

    // Capture the prior record from the closure (see updateField note).
    const previous = fertilizerRecipes.find(item => item.id === r.id);
    setFertilizerRecipes(prev => prev.map(existing => existing.id === r.id ? updatedRecipe : existing));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fertilizer_recipes', 'update', mapped, farm_id);
          if (onMutation) await onMutation();
          toast.success('Fertilizer recipe updated offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue update fertilizer recipe offline:', err);
          if (previous) setFertilizerRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
          toast.error('Failed to update recipe offline');
          return false;
        }
      }

      try {
        const { farm_id: _f, id: _i, ...payload } = mapped;
        const { error, count: affectedRows } = await supabase
          .from('fertilizer_recipes')
          .update(payload, { count: 'exact' })
          .eq('id', r.id)
          .eq('farm_id', farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Fertilizer recipe update outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('fertilizer_recipes', 'update', mapped, farm_id);
              if (onMutation) await onMutation();
              toast.success('Fertilizer recipe saved locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue fertilizer recipe update after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error updating fertilizer recipe:', error);
          } else {
            console.warn('Fertilizer recipe update affected zero rows:', r.id);
          }
          if (previous) setFertilizerRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
          toast.error('Failed to update recipe');
          return false;
        }
        toast.success('Recipe updated');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Fertilizer recipe update network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('fertilizer_recipes', 'update', mapped, farm_id);
            if (onMutation) await onMutation();
            toast.success('Fertilizer recipe saved locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue fertilizer recipe update after network error:', enqueueErr);
          }
        }
        console.error('Network error updating fertilizer recipe:', err);
        if (previous) setFertilizerRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
        toast.error('Failed to update recipe due to a network error');
        return false;
      }
    } finally {
      isRecipeMutating.current = false;
    }
  }, [farm_id, fertilizerRecipes, setFertilizerRecipes, isOnline, onMutation]);

  const deleteFertilizerRecipe = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (isRecipeMutating.current) {
      toast.error('Recipe operation in progress. Please try again.');
      return false;
    }
    isRecipeMutating.current = true;

    // Capture the prior record from the closure (see updateField note).
    const previousIndex = fertilizerRecipes.findIndex(r => r.id === id);
    const previous = previousIndex >= 0 ? fertilizerRecipes[previousIndex] : undefined;
    const deletedAt = new Date().toISOString();
    setFertilizerRecipes(prev => prev.filter(r => r.id !== id));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('fertilizer_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Recipe removed offline');
          return true;
        } catch (err) {
          console.error('Failed to enqueue delete fertilizer recipe offline:', err);
          restoreAtIndex(setFertilizerRecipes, previous, previousIndex);
          toast.error('Failed to delete recipe offline');
          return false;
        }
      }

      try {
        const { error, count: affectedRows } = await supabase
          .from('fertilizer_recipes')
          .update({ deleted_at: deletedAt }, { count: 'exact' })
          .eq('id', id)
          .eq('farm_id', farm_id);
        if (error || affectedRows !== 1) {
          if (error && isUnknownMutationOutcome(error)) {
            console.warn('Fertilizer recipe delete outcome unknown; queuing for retry:', error);
            try {
              await syncQueue.enqueueMutation('fertilizer_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
              if (onMutation) await onMutation();
              toast.success('Recipe removed locally.', {
                description: 'The connection dropped before confirmation — it will reconcile automatically.',
              });
              return true;
            } catch (enqueueErr) {
              console.error('Failed to queue fertilizer recipe delete after unknown outcome:', enqueueErr);
            }
          }
          if (error) {
            console.error('Error deleting fertilizer recipe:', error);
          } else {
            console.warn('Fertilizer recipe delete affected zero rows:', id);
          }
          restoreAtIndex(setFertilizerRecipes, previous, previousIndex);
          toast.error('Failed to delete recipe');
          return false;
        }
        toast.success('Recipe removed');
        return true;
      } catch (err) {
        if (isUnknownMutationOutcome(err)) {
          console.warn('Fertilizer recipe delete network outcome unknown; queuing for retry:', err);
          try {
            await syncQueue.enqueueMutation('fertilizer_recipes', 'soft_delete', { id, deleted_at: deletedAt }, farm_id);
            if (onMutation) await onMutation();
            toast.success('Recipe removed locally.', {
              description: 'The connection dropped before confirmation — it will reconcile automatically.',
            });
            return true;
          } catch (enqueueErr) {
            console.error('Failed to queue fertilizer recipe delete after network error:', enqueueErr);
          }
        }
        console.error('Network error deleting fertilizer recipe:', err);
        restoreAtIndex(setFertilizerRecipes, previous, previousIndex);
        toast.error('Failed to delete recipe due to a network error');
        return false;
      }
    } finally {
      isRecipeMutating.current = false;
    }
  }, [farm_id, fertilizerRecipes, setFertilizerRecipes, isOnline, onMutation]);

  return {
    addField, updateField, deleteField, flushFieldNotes,
    addBin, updateBin, deleteBin,
    addSeed, deleteSeed,
    addSprayRecipe, updateSprayRecipe, deleteSprayRecipe,
    addFertilizerRecipe, updateFertilizerRecipe, deleteFertilizerRecipe,
  };
}
