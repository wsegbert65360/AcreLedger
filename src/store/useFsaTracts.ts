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

    const { data, error } = await fsaTractService.importTract(
      id,
      tractKey,
      filename,
      geojson,
      featureCount,
      farm_id,
    );
    if (error || !data) {
      console.error('Failed to import tract:', error);
      setFsaTracts(previousTracts);
      toast.error('Failed to import tract');
      return false;
    }

    const persistedTract = mapFsaTractFromDb(data as any);
    setFsaTracts(prev => [...prev.filter(t => t.tractKey !== tractKey), persistedTract]);
    toast.success(`Tract ${tractKey} imported (${featureCount} CLUs)`);
    return true;
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
        await syncQueue.enqueueMutation('fsa_tract_imports', 'soft_delete', {
          id, deleted_at: new Date().toISOString(),
        }, farm_id);
        for (const a of previousAssignments.filter(a => a.tractKey === tract.tractKey)) {
          await syncQueue.enqueueMutation('field_clu_assignments', 'soft_delete', {
            id: a.id,
            deleted_at: new Date().toISOString(),
          }, farm_id);
        }
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

    const { data, error } = await fsaTractService.deleteTract(id, farm_id);
    if (error || data !== true) {
      console.error('Failed to delete tract:', error);
      setFsaTracts(previousTracts);
      setCluAssignments(previousAssignments);
      toast.error('Failed to delete tract');
      return false;
    }

    toast.success('Tract deleted');
    return true;
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

    const { data, error } = await cluAssignmentService.saveAssignment(
      id,
      fieldId,
      tractKey,
      cluNumber,
      acres,
      landUse,
      farm_id,
    );
    if (error || !data) {
      console.error('Failed to assign CLU:', error);
      setCluAssignments(previousAssignments);
      toast.error('Failed to assign CLU');
      return false;
    }

    const persistedAssignment = mapFieldCluAssignmentFromDb(data as any);
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

    const { data, error } = await cluAssignmentService.updateLandUse(assignmentId, landUse, farm_id);
    if (error || !data) {
      console.error('Failed to update CLU land use:', error);
      setCluAssignments(previousAssignments);
      toast.error('Failed to update CLU land use');
      return false;
    }

    const persistedAssignment = mapFieldCluAssignmentFromDb(data as any);
    setCluAssignments(prev => prev.map(a => (a.id === assignmentId ? persistedAssignment : a)));
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

    setCluAssignments(prev => prev.filter(
      a => !(a.fieldId === fieldId && a.tractKey === tractKey && a.cluNumber === cluNumber),
    ));

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('field_clu_assignments', 'soft_delete', {
          id: assignment.id,
          deleted_at: new Date().toISOString(),
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

    const { error } = await cluAssignmentService.removeAssignment(assignment.id, farm_id);
    if (error) {
      console.error('Failed to unassign CLU:', error);
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
        for (const a of toDelete) {
          await syncQueue.enqueueMutation('field_clu_assignments', 'soft_delete', {
            id: a.id,
            deleted_at: deletedAt,
          }, farm_id);
        }
        if (onMutation) await onMutation();
        return true;
      } catch (err) {
        console.error('Failed to enqueue mass CLU unassignment offline:', err);
        setCluAssignments(previousAssignments);
        return false;
      }
    }

    let allSuccess = true;
    for (const a of toDelete) {
      const { error } = await cluAssignmentService.removeAssignment(a.id, farm_id);
      if (error) {
        console.error('Failed to unassign CLU on field delete:', error);
        allSuccess = false;
      }
    }

    if (!allSuccess) {
      setCluAssignments(previousAssignments);
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
