import { useCallback, useRef } from 'react';
import { WorkRequest } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { mapWorkRequestToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';
import { generateRequestNumber } from '@/lib/workRequests/requestNumber';

interface UseWorkRequestsArgs {
  farm_id: string | null;
  workRequests: WorkRequest[];
  setWorkRequests: React.Dispatch<React.SetStateAction<WorkRequest[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

type OpResult = boolean;

export function useWorkRequests({ farm_id, workRequests, setWorkRequests, isOnline, onMutation }: UseWorkRequestsArgs) {
  const isMutating = useRef(false);

  // ─── Add ──────────────────────────────────────────────────────────────────
  const addWorkRequest = useCallback(async (
    r: Omit<WorkRequest, 'id' | 'timestamp' | 'deleted_at' | 'farm_id'>,
    onCreated?: (record: WorkRequest) => void,
  ): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    // Ensure a unique request number, scoped against the current in-memory list.
    const requestNumber = r.requestNumber || generateRequestNumber(workRequests, timestamp);
    const newRecord: WorkRequest = {
      ...r,
      requestNumber,
      id,
      timestamp,
      createdAt: r.createdAt || nowIso,
      updatedAt: nowIso,
      deleted_at: null,
      farm_id,
    };

    let mapped: ReturnType<typeof mapWorkRequestToDb>;
    try {
      mapped = mapWorkRequestToDb(newRecord);
    } catch (err) {
      console.error('mapWorkRequestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare work request — check inputs.');
      return false;
    }

    setWorkRequests(prev => [...prev, newRecord]);

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('work_requests', 'insert', { ...mapped, farm_id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Work request saved offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          onCreated?.(newRecord);
          return true;
        } catch (err) {
          console.error('Failed to enqueue work request offline:', err);
          setWorkRequests(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save work request offline.');
          return false;
        }
      }

      let error;
      try {
        const res = await supabase.from('work_requests').insert([{ ...mapped, farm_id }]);
        error = res.error;
      } catch (err) {
        error = err;
      }

      // Unique-constraint collision on request_number: regenerate and retry once.
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
        const regenerated = generateRequestNumber(workRequests, timestamp + 1);
        const retryRecord: WorkRequest = { ...newRecord, requestNumber: regenerated };
        let retryMapped: ReturnType<typeof mapWorkRequestToDb>;
        try {
          retryMapped = mapWorkRequestToDb(retryRecord);
        } catch {
          setWorkRequests(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save work request (request number conflict).');
          return false;
        }
        setWorkRequests(prev => prev.map(rec => rec.id === id ? retryRecord : rec));
        let retryError;
        try {
          const res = await supabase.from('work_requests').insert([{ ...retryMapped, farm_id }]);
          retryError = res.error;
        } catch (err) {
          retryError = err;
        }
        if (retryError) {
          console.error('Error adding work request after regenerate:', retryError);
          setWorkRequests(prev => prev.filter(rec => rec.id !== id));
          toast.error('Failed to save work request.');
          return false;
        }
        toast.success('Work request saved.');
        onCreated?.(retryRecord);
        return true;
      }

      if (error) {
        console.error('Error adding work request:', error);
        setWorkRequests(prev => prev.filter(rec => rec.id !== id));
        toast.error('Failed to save work request.');
        return false;
      }

      toast.success('Work request saved.');
      onCreated?.(newRecord);
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [workRequests, farm_id, setWorkRequests, isOnline, onMutation]);

  // ─── Update ───────────────────────────────────────────────────────────────
  const updateWorkRequest = useCallback(async (r: WorkRequest): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (isMutating.current) return false;
    isMutating.current = true;

    const stamped: WorkRequest = { ...r, updatedAt: new Date().toISOString() };

    let mapped: ReturnType<typeof mapWorkRequestToDb>;
    try {
      mapped = mapWorkRequestToDb(stamped);
    } catch (err) {
      console.error('mapWorkRequestToDb failed:', err);
      isMutating.current = false;
      toast.error('Failed to prepare work request — check inputs.');
      return false;
    }

    const previous = workRequests.find(item => item.id === r.id);
    if (!previous) {
      isMutating.current = false;
      toast.error('Could not update work request — refresh and try again.');
      return false;
    }
    setWorkRequests(prev => prev.map(item => item.id === r.id ? stamped : item));

    try {
      if (!isOnline) {
        try {
          await syncQueue.enqueueMutation('work_requests', 'update', { ...mapped, id: r.id }, farm_id);
          if (onMutation) await onMutation();
          toast.success('Work request updated offline.', {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue work request update offline:', err);
          setWorkRequests(prev => prev.map(item => item.id === r.id ? previous : item));
          toast.error('Failed to update work request offline.');
          return false;
        }
      }

      const { farm_id: _f, id: _i, ...payload } = mapped;
      let error, affectedRows;
      try {
        const res = await supabase
          .from('work_requests')
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
          console.error('Error updating work request:', error);
        } else {
          console.warn('Work request update affected zero rows:', r.id);
        }
        setWorkRequests(prev => prev.map(item => item.id === r.id ? previous : item));
        toast.error('Failed to update work request.');
        return false;
      }

      toast.success('Work request updated.');
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, workRequests, setWorkRequests, isOnline, onMutation]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteWorkRequests = useCallback(async (ids: string[]): Promise<OpResult> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (ids.length === 0) return true;
    if (isMutating.current) return false;
    isMutating.current = true;

    const snapshot = workRequests
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => ids.includes(record.id));
    setWorkRequests(prev => prev.filter(r => !ids.includes(r.id)));

    try {
      if (!isOnline) {
        try {
          const deletedAt = new Date().toISOString();
          await syncQueue.enqueueMutations(ids.map(id => ({
            tableName: 'work_requests', operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt }, farmId: farm_id,
          })));
          if (onMutation) await onMutation();
          const count = ids.length;
          toast.success(`${count} work request${count !== 1 ? 's' : ''} deleted offline.`, {
            description: 'Queued locally — will sync automatically when connection is restored.',
          });
          return true;
        } catch (err) {
          console.error('Failed to enqueue work request delete offline:', err);
          const rollbackSnapshot = [...snapshot].sort((a, b) => b.index - a.index);
          setWorkRequests(prev => {
            const restored = [...prev];
            for (const { record, index } of rollbackSnapshot) {
              const insertAt = Math.min(index, restored.length);
              restored.splice(insertAt, 0, record);
            }
            return restored;
          });
          toast.error('Failed to delete work requests offline.');
          return false;
        }
      }

      let error, affectedRows;
      try {
        const res = await supabase
          .from('work_requests')
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
          console.error('Error deleting work requests:', error);
        } else {
          console.warn('Work request delete mismatch:', { requested: ids.length, affected: affectedRows ?? 0 });
        }
        const rollbackSnapshot = [...snapshot].sort((a, b) => b.index - a.index);
        setWorkRequests(prev => {
          const restored = [...prev];
          for (const { record, index } of rollbackSnapshot) {
            const insertAt = Math.min(index, restored.length);
            restored.splice(insertAt, 0, record);
          }
          return restored;
        });
        toast.error('Failed to delete work requests.');
        return false;
      }

      const count = ids.length;
      toast.success(`${count} work request${count !== 1 ? 's' : ''} deleted.`);
      return true;
    } finally {
      isMutating.current = false;
    }
  }, [farm_id, workRequests, setWorkRequests, isOnline, onMutation]);

  return { addWorkRequest, updateWorkRequest, deleteWorkRequests };
}
