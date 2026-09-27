import { useCallback, useRef } from 'react';
import { Field, GrainMovement, HarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb, mapHarvestToDb } from '@/lib/mappers';
import { LINKED_GRAIN_MUTATION_KEY, syncQueue } from '@/lib/syncQueue';

interface UseHarvestRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  fields: Field[];
  harvestRecords: HarvestRecord[];
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
  grainMovements: GrainMovement[];
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function useHarvestRecords({
  farm_id, viewingSeason, fields, harvestRecords, setHarvestRecords,
  grainMovements, setGrainMovements, isOnline, onMutation,
}: UseHarvestRecordsArgs) {
  const isMutating = useRef(false);

  const addHarvestWithGrain = useCallback(async (input: {
    harvest: Omit<HarvestRecord, 'deleted_at' | 'seasonYear' | 'farm_id'>;
    grainMovement: Omit<GrainMovement, 'deleted_at' | 'seasonYear' | 'farm_id' | 'version'>;
  }): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const newHarvest: HarvestRecord = {
      ...input.harvest,
      seasonYear: viewingSeason,
      deleted_at: null,
      farm_id,
    };
    const newGrain: GrainMovement = {
      ...input.grainMovement,
      harvestRecordId: newHarvest.id,
      seasonYear: viewingSeason,
      deleted_at: null,
      farm_id,
      version: 1,
    };

    let mappedHarvest: ReturnType<typeof mapHarvestToDb>;
    let mappedGrain: ReturnType<typeof mapGrainToDb>;
    try {
      mappedHarvest = mapHarvestToDb(newHarvest);
      mappedGrain = mapGrainToDb(newGrain);
    } catch (err) {
      console.error('Failed to prepare linked harvest and grain movement:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    const previousHarvest = harvestRecords.find(record => record.id === newHarvest.id);
    const previousGrain = grainMovements.find(record => record.id === newGrain.id);
    setHarvestRecords(previous => previous.some(record => record.id === newHarvest.id)
      ? previous.map(record => record.id === newHarvest.id ? newHarvest : record)
      : [...previous, newHarvest]);
    setGrainMovements(previous => previous.some(record => record.id === newGrain.id)
      ? previous.map(record => record.id === newGrain.id ? newGrain : record)
      : [...previous, newGrain]);

    const rollback = () => {
      setHarvestRecords(previous => previousHarvest
        ? previous.map(record => record.id === newHarvest.id ? previousHarvest : record)
        : previous.filter(record => record.id !== newHarvest.id));
      setGrainMovements(previous => previousGrain
        ? previous.map(record => record.id === newGrain.id ? previousGrain : record)
        : previous.filter(record => record.id !== newGrain.id));
    };

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutations([{
            tableName: 'harvest_records',
            operation: 'insert',
            payload: { ...mappedHarvest, [LINKED_GRAIN_MUTATION_KEY]: mappedGrain },
            farmId: farm_id,
          }]);
          await onMutation();
          toast.success('Harvest and grain movement recorded offline.', {
            description: 'Queued together — they will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue linked harvest and grain movement:', err);
          rollback();
          toast.error('Failed to save harvest offline.');
          return false;
        }
      }

      let error: unknown = null;
      try {
        const result = await supabase.rpc('create_harvest_with_grain', {
          p_farm_id: farm_id,
          p_idempotency_key: newHarvest.id,
          p_harvest: mappedHarvest,
          p_grain_movement: mappedGrain,
        });
        error = result.error;
      } catch (err) {
        error = err;
      }
      if (error) {
        console.error('Error adding linked harvest and grain movement:', error);
        rollback();
        toast.error('Failed to save harvest and grain movement.');
        return false;
      }

      toast.success('Harvest and grain movement recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, grainMovements, harvestRecords, isOnline, onMutation, setGrainMovements, setHarvestRecords, viewingSeason]);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addHarvestRecord = useCallback(async (
    r: Omit<HarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { id?: string; timestamp?: number }
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const id = r.id ?? crypto.randomUUID();
    const timestamp = r.timestamp ?? Date.now();
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: viewingSeason, deleted_at: null, farm_id };

    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(newRecord);
    } catch (err) {
      console.error('mapHarvestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    setHarvestRecords(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('harvest_records', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Harvest recorded offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue harvest record offline:', err);
          setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save record offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase
          .from('harvest_records')
          .insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('Error adding harvest record:', error);
        setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save harvest record.');
        return false;
      }

      toast.success('Harvest recorded.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [viewingSeason, farm_id, setHarvestRecords, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateHarvestRecord = useCallback(async (r: HarvestRecord): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(r);
    } catch (err) {
      console.error('mapHarvestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    const previous = harvestRecords.find(item => item.id === r.id);
    if (!previous) {
      isMutating.current = false;
      toast.error('Could not update record — refresh and try again.');
      return false;
    }
    setHarvestRecords(prev => prev.map(item => item.id === r.id ? r : item));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('harvest_records', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Harvest record updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue harvest record update offline:', err);
          if (previous) {
            setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
          } else {
            setHarvestRecords(prev => prev.filter(item => item.id !== r.id));
          }
          toast.error('Failed to update record offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const res = await supabase
          .from('harvest_records')
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
          console.error('Error updating harvest record:', error);
        } else {
          console.warn('Harvest update affected zero rows:', r.id);
        }
        if (previous) {
          setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
        } else {
          setHarvestRecords(prev => prev.filter(item => item.id !== r.id));
        }
        toast.error('Failed to update record.');
        return false;
      }

      toast.success('Record updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, harvestRecords, setHarvestRecords, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteHarvestRecords = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    const snapshot = harvestRecords
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => ids.includes(record.id));
    const grainSnapshot = grainMovements
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record.harvestRecordId && ids.includes(record.harvestRecordId));
    setHarvestRecords(prev => prev.filter(r => !ids.includes(r.id)));
    setGrainMovements(prev => prev.filter(
      movement => !movement.harvestRecordId || !ids.includes(movement.harvestRecordId),
    ));

    const rollback = () => {
      const rollbackHarvests = [...snapshot].sort((a, b) => b.index - a.index);
      setHarvestRecords(prev => {
        const restored = [...prev];
        for (const { record, index } of rollbackHarvests) {
          const insertAt = Math.min(index, restored.length);
          restored.splice(insertAt, 0, record);
        }
        return restored;
      });
      const rollbackGrain = [...grainSnapshot].sort((a, b) => b.index - a.index);
      setGrainMovements(prev => {
        const restored = [...prev];
        for (const { record, index } of rollbackGrain) {
          const insertAt = Math.min(index, restored.length);
          restored.splice(insertAt, 0, record);
        }
        return restored;
      });
    };

    try {
      if (!isOnline) {
        try {
          const deletedAt = new Date().toISOString();
          await syncQueue.enqueueMutations([
            ...ids.map(id => ({
            tableName: 'harvest_records', operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt }, farmId: farm_id,
            })),
            ...grainSnapshot.map(({ record }) => ({
              tableName: 'grain_movements', operation: 'soft_delete' as const,
              payload: {
                id: record.id,
                deleted_at: deletedAt,
                __expected_version: record.version ?? 1,
              },
              farmId: farm_id,
            })),
          ]);
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} record${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue harvest record delete offline:', err);
          rollback();
          toast.error('Failed to delete records offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase.rpc('soft_delete_harvests_with_grain', {
          p_farm_id: farm_id,
          p_harvest_ids: ids,
          p_deleted_at: new Date().toISOString(),
        });
        error = res.error;
      } catch (err) {
        error = err;
      }

      if (error) {
        if (error) {
          console.error('Error deleting harvest records:', error);
        }
        rollback();
        toast.error('Failed to delete records.');
        return false;
      }

      const count = ids.length;
      toast.success(`${count} record${count !== 1 ? 's' : ''} deleted.`);
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, harvestRecords, setHarvestRecords, grainMovements, setGrainMovements, isOnline, onMutation]);

  // ─── Reassign field (move a truckload without delete/re-enter) ─────────────
  const reassignHarvestField = useCallback(async (
    loadId: string,
    newFieldId: string,
    reason?: string,
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const current = harvestRecords.find(record => record.id === loadId && !record.deleted_at);
    if (!current) {
      isMutating.current = false;
      toast.error('Could not move harvest — refresh and try again.');
      return false;
    }
    const targetField = fields.find(field => field.id === newFieldId && !field.deleted_at);
    if (!targetField) {
      isMutating.current = false;
      toast.error('Choose an active field to move this harvest to.');
      return false;
    }
    if (targetField.id === current.fieldId) {
      isMutating.current = false;
      toast.error('This harvest is already on that field.');
      return false;
    }

    const trimmedReason = reason?.trim();
    const movedHarvest: HarvestRecord = {
      ...current,
      fieldId: targetField.id,
      fieldName: targetField.name,
      // A new move replaces any prior note; moving without a reason clears it.
      moveReason: trimmedReason || undefined,
    };

    // Mapper discipline: validate the full updated record, then persist only
    // the reassigned columns so a concurrent edit to other fields survives.
    let mapped: ReturnType<typeof mapHarvestToDb>;
    try {
      mapped = mapHarvestToDb(movedHarvest);
    } catch (err) {
      console.error('mapHarvestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare record — check inputs.');
      return false;
    }

    // Active linked grain movements carry the source field name on their rows.
    const linkedMovements = grainMovements.filter(
      movement => movement.harvestRecordId === loadId && !movement.deleted_at,
    );
    const movedMovements = linkedMovements.map(movement => {
      const expectedVersion = Number.isInteger(movement.version) && (movement.version ?? 0) > 0
        ? movement.version as number
        : 1;
      return {
        previous: movement,
        expectedVersion,
        next: {
          ...movement,
          sourceFieldName: targetField.name,
          version: expectedVersion + 1,
        },
      };
    });

    // Capture rollback snapshots from the render closure before the optimistic
    // setters, never by mutating an outer variable inside a state updater.
    const previousHarvest = current;
    const rollback = () => {
      setHarvestRecords(prev => prev.map(item => item.id === loadId ? previousHarvest : item));
      setGrainMovements(prev => prev.map(item => {
        const restored = movedMovements.find(entry => entry.next.id === item.id);
        return restored ? restored.previous : item;
      }));
    };

    setHarvestRecords(prev => prev.map(item => item.id === loadId ? movedHarvest : item));
    setGrainMovements(prev => prev.map(item => {
      const moved = movedMovements.find(entry => entry.previous.id === item.id);
      return moved ? moved.next : item;
    }));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutations([
            {
              tableName: 'harvest_records',
              operation: 'update',
              payload: {
                id: loadId,
                field_id: mapped.field_id,
                field_name: mapped.field_name,
                move_reason: mapped.move_reason,
              },
              farmId: farm_id,
            },
            ...movedMovements.map(({ previous, expectedVersion }) => ({
              tableName: 'grain_movements',
              operation: 'update' as const,
              payload: {
                id: previous.id,
                source_field_name: targetField.name,
                __expected_version: expectedVersion,
              },
              farmId: farm_id,
            })),
          ]);
          await onMutation();
          toast.success(`Harvest moved to ${targetField.name} offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue harvest field reassignment offline:', err);
          rollback();
          toast.error('Failed to move harvest offline.');
          return false;
        }
      }

      let error;
      let affectedRows;
      try {
        const res = await supabase
          .from('harvest_records')
          .update({
            field_id: mapped.field_id,
            field_name: mapped.field_name,
            move_reason: mapped.move_reason,
          }, { count: 'exact' })
          .eq('id', loadId)
          .eq('farm_id', farm_id);
        error = res.error;
        affectedRows = res.count;
      } catch (err) {
        error = err;
      }

      if (error || affectedRows !== 1) {
        if (error) {
          console.error('Error reassigning harvest field:', error);
        } else {
          console.warn('Harvest reassignment affected zero rows:', loadId);
        }
        rollback();
        toast.error('Failed to move harvest.');
        return false;
      }

      for (const { previous, expectedVersion } of movedMovements) {
        let grainError;
        let grainRows;
        try {
          const res = await supabase
            .from('grain_movements')
            .update({ source_field_name: targetField.name }, { count: 'exact' })
            .eq('id', previous.id)
            .eq('farm_id', farm_id)
            .eq('version', expectedVersion);
          grainError = res.error;
          grainRows = res.count;
        } catch (err) {
          grainError = err;
        }

        if (grainError || grainRows !== 1) {
          if (grainError) {
            console.error('Error updating linked grain movement source field:', grainError);
          } else {
            console.warn('Linked grain movement concurrency conflict detected:', {
              id: previous.id,
              expectedVersion,
            });
          }
          rollback();
          toast.error('This load changed elsewhere. Please refresh and try again.');
          return false;
        }
      }

      toast.success(`Harvest moved to ${targetField.name}.`);
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, fields, grainMovements, harvestRecords, isOnline, onMutation, setGrainMovements, setHarvestRecords]);

  return { addHarvestRecord, addHarvestWithGrain, updateHarvestRecord, deleteHarvestRecords, reassignHarvestField };
}
