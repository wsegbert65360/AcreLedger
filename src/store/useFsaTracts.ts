import { useCallback } from 'react';

import { toast } from 'sonner';

import { mapFieldCluAssignmentFromDb, mapFieldCluAssignmentToDb, mapFsaTractFromDb, mapFsaTractToDb } from '@/lib/mappers';
import { syncQueue } from '@/lib/syncQueue';
import { cluAssignmentService } from '@/services/cluAssignmentService';
import { fsaTractService } from '@/services/fsaTractService';
import { CluLandUse, FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';

interface UseFsaTractsArgs {
  farm_id: string | null;
  fsaTracts: FsaTractImport[];
  cluAssignments: FieldCluAssignment[];
  setFsaTracts: React.Dispatch<React.SetStateAction<FsaTractImport[]>>;
  setCluAssignments: React.Dispatch<React.SetStateAction<FieldCluAssignment[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

export function useFsaTracts({
  farm_id, fsaTracts, cluAssignments, setFsaTracts, setCluAssignments,
  isOnline, onMutation,
}: UseFsaTractsArgs) {
  const fetchTractsAndAssignments = useCallback(async () => {
    if (!farm_id || !isOnline) return;

    const [tractResult, assignmentResult] = await Promise.all([
      fsaTractService.fetchTracts(farm_id),
      cluAssignmentService.fetchAssignmentsForFarm(farm_id),
    ]);

    if (tractResult.data) {
      setFsaTracts(tractResult.data.map(mapFsaTractFromDb));
    }
    if (assignmentResult.data) {
      setCluAssignments(assignmentResult.data.map(mapFieldCluAssignmentFromDb));
    }
  }, [farm_id, isOnline, setFsaTracts, setCluAssignments]);

  const importTract = useCallback(async (
    tractKey: string, filename: string, geojson: unknown, featureCount: number
  ): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }

    const previousTracts = fsaTracts;
    const existingTract = fsaTracts.find(t => t.tractKey === tractKey);

    const id = existingTract?.id ?? crypto.randomUUID();
    const newTract: FsaTractImport = {
      id,
      farmId: farm_id,
      tractKey,
      filename,
      featureCount,
      geojson: geojson as FsaTractImport['geojson'],
      importedAt: new Date().toISOString(),
      deletedAt: null,
    };
    const dbPayload = mapFsaTractToDb(newTract);

    setFsaTracts(prev => [...prev.filter(t => t.tractKey !== tractKey), newTract]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fsa_tract_imports', 'insert', {
          ...dbPayload,
          geojson,
        }, farm_id);
        if (onMutation) await onMutation();
        toast.success(`Tract ${tractKey} imported (${featureCount} CLUs)`);
        return true;
      } catch (err) {
        console.error('Failed to enqueue tract import offline:', err);
        setFsaTracts(previousTracts);
        toast.error('Failed to save tract offline');
        return false;
      }
    }

    try {
      const { data, error } = await fsaTractService.importTract(
        id,
        tractKey,
        filename,
        geojson,
        featureCount,
        farm_id,
      );
      if (error || !data) throw error ?? new Error('No tract returned.');

      const persistedTract = mapFsaTractFromDb(data as any);
      setFsaTracts(prev => [...prev.filter(t => t.tractKey !== tractKey), persistedTract]);
      toast.success(`Tract ${tractKey} imported (${featureCount} CLUs)`);
      return true;
    } catch (error) {
      console.error('Failed to import tract:', error);
      setFsaTracts(previousTracts);
      toast.error('Failed to import tract');
      return false;
    }
  }, [farm_id, fsaTracts, setFsaTracts, isOnline, onMutation]);

  const deleteTract = useCallback(async (id: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }

    const tract = fsaTracts.find(t => t.id === id);
    if (!tract) {
      toast.error('Tract not found');
      return false;
    }

    const previousTracts = fsaTracts;
    const previousAssignments = cluAssignments;
    setFsaTracts(prev => prev.filter(t => t.id !== id));
    setCluAssignments(prev => prev.filter(a => a.tractKey !== tract.tractKey));

    if (!isOnline) {
      try {
        const deletedAt = new Date().toISOString();
        // Atomic batch: the tract soft-delete plus all of its CLU assignment
        // soft-deletes enqueue together. A partial failure must not leave the
        // tract queued while its assignments are not (or vice versa).
        const batch = [
          {
            tableName: 'fsa_tract_imports',
            operation: 'soft_delete' as const,
            payload: { id, deleted_at: deletedAt },
            farmId: farm_id,
          },
          ...previousAssignments
            .filter(a => a.tractKey === tract.tractKey)
            .map(a => ({
              tableName: 'field_clu_assignments',
              operation: 'soft_delete' as const,
              payload: { id: a.id, deleted_at: deletedAt },
              farmId: farm_id,
            })),
        ];
        await syncQueue.enqueueMutations(batch);
        if (onMutation) await onMutation();
        toast.success('Tract deleted offline');
        return true;
      } catch (err) {
        console.error('Failed to enqueue tract delete offline:', err);
        setFsaTracts(previousTracts);
        setCluAssignments(previousAssignments);
        toast.error('Failed to delete tract offline');
        return false;
      }
    }

    try {
      const { data, error } = await fsaTractService.deleteTract(id, farm_id);
      if (error || data !== true) throw error ?? new Error('Tract was not deleted.');
      toast.success('Tract deleted');
      return true;
    } catch (error) {
      console.error('Failed to delete tract:', error);
      setFsaTracts(previousTracts);
      setCluAssignments(previousAssignments);
      toast.error('Failed to delete tract');
      return false;
    }
  }, [
    farm_id,
    fsaTracts,
    cluAssignments,
    setFsaTracts,
    setCluAssignments,
    isOnline,
    onMutation,
  ]);

  const assignClu = useCallback(async (
    fieldId: string, tractKey: string, cluNumber: string, acres: number, landUse: CluLandUse = 'cropland'
  ): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }
    if (!Number.isFinite(acres) || acres <= 0) {
      toast.error('CLU acreage must be greater than zero');
      return false;
    }

    const previousAssignments = cluAssignments;
    const existingAssignment = cluAssignments.find(
      a => a.tractKey === tractKey && a.cluNumber === cluNumber,
    );

    const id = existingAssignment?.id ?? crypto.randomUUID();
    const newAssignment: FieldCluAssignment = {
      id,
      farmId: farm_id,
      fieldId,
      tractKey,
      cluNumber,
      acres,
      landUse,
      assignedAt: new Date().toISOString(),
      deletedAt: null,
    };
    const dbPayload = mapFieldCluAssignmentToDb(newAssignment);

    setCluAssignments(prev => [...prev.filter(a => !(a.tractKey === tractKey && a.cluNumber === cluNumber)), newAssignment]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('field_clu_assignments', 'insert', dbPayload, farm_id);
        if (onMutation) await onMutation();
        return true;
      } catch (err) {
        console.error('Failed to enqueue CLU assignment offline:', err);
        setCluAssignments(previousAssignments);
        toast.error('Failed to save assignment offline');
        return false;
      }
    }

    let savedAssignment: unknown = null;
    let saveError: unknown = null;

    try {
      const result = await cluAssignmentService.saveAssignment(
        id,
        fieldId,
        tractKey,
        cluNumber,
        acres,
        landUse,
        farm_id,
      );
      savedAssignment = result.data;
      saveError = result.error;
    } catch (error) {
      saveError = error;
    }

    if (saveError || !savedAssignment) {
      console.error('Failed to assign CLU:', saveError);
      setCluAssignments(previousAssignments);
      toast.error('Failed to assign CLU');
      return false;
    }

    const persistedAssignment = mapFieldCluAssignmentFromDb(savedAssignment as any);
    setCluAssignments(prev => [
      ...prev.filter(a => !(a.tractKey === tractKey && a.cluNumber === cluNumber)),
      persistedAssignment,
    ]);
    return true;
  }, [farm_id, cluAssignments, setCluAssignments, isOnline, onMutation]);

  const updateCluLandUse = useCallback(async (
    assignmentId: string, landUse: CluLandUse
  ): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }

    const previousAssignments = cluAssignments;
    const assignment = cluAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      toast.error('CLU assignment not found');
      return false;
    }

    const updatedAssignment: FieldCluAssignment = { ...assignment, landUse };
    const dbPayload = mapFieldCluAssignmentToDb(updatedAssignment);

    setCluAssignments(prev => prev.map(a => (a.id === assignmentId ? updatedAssignment : a)));

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('field_clu_assignments', 'update', dbPayload, farm_id);
        if (onMutation) await onMutation();
        return true;
      } catch (err) {
        console.error('Failed to enqueue CLU land use update offline:', err);
        setCluAssignments(previousAssignments);
        toast.error('Failed to save land use offline');
        return false;
      }
    }

    let updateCount: number | null = null;
    let updateError: unknown = null;

    try {
      const result = await cluAssignmentService.updateLandUse(assignmentId, landUse, farm_id);
      updateCount = result.count;
      updateError = result.error;
    } catch (error) {
      updateError = error;
    }

    if (updateError || updateCount !== 1) {
      console.error('Failed to update CLU land use:', updateError);
      setCluAssignments(previousAssignments);
      toast.error('Failed to update CLU land use');
      return false;
    }

    // updateLandUse writes only the `land_use` column, and `updatedAssignment`
    // already carries every other field of the row we read at the top of this
    // function — so the optimistic value is authoritative. We intentionally do
    // NOT re-fetch or `.select()` after the update: the deleted_at IS NULL RLS
    // policy would hide a row that a concurrent client soft-deleted, making the
    // client think the update failed. If a future migration adds a trigger that
    // normalizes other columns on land_use change, switch to a service_role
    // re-fetch instead of a client `.select()`.
    return true;
  }, [farm_id, cluAssignments, setCluAssignments, isOnline, onMutation]);

  const unassignClu = useCallback(async (
    fieldId: string, tractKey: string, cluNumber: string
  ): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected');
      return false;
    }

    const previousAssignments = cluAssignments;
    const assignment = cluAssignments.find(
      a => a.fieldId === fieldId && a.tractKey === tractKey && a.cluNumber === cluNumber,
    );

    if (!assignment) {
      toast.error('CLU assignment not found');
      return false;
    }

    const deletedAt = new Date().toISOString();

    setCluAssignments(prev => prev.filter(
      a => !(a.fieldId === fieldId && a.tractKey === tractKey && a.cluNumber === cluNumber),
    ));

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('field_clu_assignments', 'soft_delete', {
          id: assignment.id,
          deleted_at: deletedAt,
        }, farm_id);
        if (onMutation) await onMutation();
        return true;
      } catch (err) {
        console.error('Failed to enqueue CLU unassignment offline:', err);
        setCluAssignments(previousAssignments);
        toast.error('Failed to remove assignment offline');
        return false;
      }
    }

    let deleteCount: number | null = null;
    let deleteError: unknown = null;

    try {
      const result = await cluAssignmentService.removeAssignment(assignment.id, farm_id, deletedAt);
      deleteCount = result.count;
      deleteError = result.error;
    } catch (error) {
      deleteError = error;
    }

    if (deleteError || deleteCount !== 1) {
      console.error('Failed to unassign CLU:', deleteError);
      setCluAssignments(previousAssignments);
      toast.error('Failed to remove CLU assignment');
      return false;
    }

    return true;
  }, [farm_id, cluAssignments, setCluAssignments, isOnline, onMutation]);

  const unassignAllClusForField = useCallback(async (fieldId: string): Promise<boolean> => {
    if (!farm_id) return false;

    const toDelete = cluAssignments.filter(a => a.fieldId === fieldId && !a.deletedAt);
    if (toDelete.length === 0) return true;

    const previousAssignments = cluAssignments;
    const deletedAt = new Date().toISOString();

    setCluAssignments(prev => prev.map(a => 
      a.fieldId === fieldId ? { ...a, deletedAt } : a
    ));

    if (!isOnline) {
      try {
        // Atomic batch: all field CLU assignments enqueue together so a partial
        // failure rolls back the whole cascade rather than leaving some queued.
        await syncQueue.enqueueMutations(
          toDelete.map(a => ({
            tableName: 'field_clu_assignments',
            operation: 'soft_delete' as const,
            payload: { id: a.id, deleted_at: deletedAt },
            farmId: farm_id,
          }))
        );
        if (onMutation) await onMutation();
        return true;
      } catch (err) {
        console.error('Failed to enqueue mass CLU unassignment offline:', err);
        setCluAssignments(previousAssignments);
        return false;
      }
    }

    let deleteError: unknown = null;
    try {
      for (const a of toDelete) {
        const result = await cluAssignmentService.removeAssignment(a.id, farm_id, deletedAt);
        if (result.error || result.count !== 1) {
          deleteError = result.error ?? new Error(`Expected to remove 1 CLU assignment, removed ${result.count ?? 0}`);
          break;
        }
      }
    } catch (error) {
      deleteError = error;
    }

    if (deleteError) {
      console.error('Failed to unassign CLU on field delete:', deleteError);
      setCluAssignments(previousAssignments);
      toast.error('Failed to remove CLU assignments');
      return false;
    }
    return true;
  }, [farm_id, cluAssignments, setCluAssignments, isOnline, onMutation]);

  return {
    fetchTractsAndAssignments,
    importTract,
    deleteTract,
    assignClu,
    updateCluLandUse,
    unassignClu,
    unassignAllClusForField,
  };
}
