import { useCallback, useRef } from 'react';
import { GrainMovement, HarvestRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapGrainToDb, mapHarvestToDb } from '@/lib/mappers';
import { LINKED_GRAIN_MUTATION_KEY, syncQueue } from '@/lib/syncQueue';

interface UseHarvestRecordsArgs {
  farm_id: string | null;
  viewingSeason: number;
  harvestRecords: HarvestRecord[];
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
  grainMovements: GrainMovement[];
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function useHarvestRecords({
  farm_id, viewingSeason, harvestRecords, setHarvestRecords,
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

  return { addHarvestRecord, addHarvestWithGrain, updateHarvestRecord, deleteHarvestRecords };
}
