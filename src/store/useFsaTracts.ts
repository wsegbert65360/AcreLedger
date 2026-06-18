import { useCallback } from 'react';
import { CluLandUse, FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import { toast } from 'sonner';
import { fsaTractService } from '@/services/fsaTractService';
import { cluAssignmentService } from '@/services/cluAssignmentService';
import { syncQueue } from '@/lib/syncQueue';

interface UseFsaTractsArgs {
  farm_id: string | null;
  fsaTracts: FsaTractImport[];
  cluAssignments: FieldCluAssignment[];
  setFsaTracts: React.Dispatch<React.SetStateAction<FsaTractImport[]>>;
  setCluAssignments: React.Dispatch<React.SetStateAction<FieldCluAssignment[]>>;
  isOnline: boolean;
  onMutation: () => void | Promise<void>;
}

interface DbTractRow {
  id: string;
  farm_id: string;
  tract_key: string;
  filename: string;
  feature_count: number;
  geojson: unknown;
  imported_at: string;
  deleted_at: string | null;
}

interface DbAssignmentRow {
  id: string;
  farm_id: string;
  field_id: string;
  tract_key: string;
  clu_number: string;
  acres: number | null;
  land_use: CluLandUse | null;
  assigned_at: string;
  deleted_at: string | null;
}

interface DbAssignmentPayload {
  id: string;
  farm_id: string;
  field_id: string;
  tract_key: string;
  clu_number: string;
  acres: number;
  land_use: CluLandUse;
  assigned_at: string;
  deleted_at: string | null;
}

export function mapTractFromDb(row: DbTractRow): FsaTractImport {
  return {
    id: row.id,
    farmId: row.farm_id,
    tractKey: row.tract_key,
    filename: row.filename,
    featureCount: row.feature_count,
    geojson: row.geojson as FsaTractImport['geojson'],
    importedAt: row.imported_at,
    deletedAt: row.deleted_at,
  };
}

export function mapAssignmentFromDb(row: DbAssignmentRow): FieldCluAssignment {
  return {
    id: row.id,
    farmId: row.farm_id,
    fieldId: row.field_id,
    tractKey: row.tract_key,
    cluNumber: row.clu_number,
    acres: row.acres ?? 0,
    landUse: row.land_use ?? 'cropland',
    assignedAt: row.assigned_at,
    deletedAt: row.deleted_at,
  };
}

function mapAssignmentToDb(assignment: FieldCluAssignment): DbAssignmentPayload {
  return {
    id: assignment.id,
    farm_id: assignment.farmId,
    field_id: assignment.fieldId,
    tract_key: assignment.tractKey,
    clu_number: assignment.cluNumber,
    acres: assignment.acres,
    land_use: assignment.landUse,
    assigned_at: assignment.assignedAt,
    deleted_at: assignment.deletedAt,
  };
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
      setFsaTracts(tractResult.data.map(mapTractFromDb));
    }
    if (assignmentResult.data) {
      setCluAssignments(assignmentResult.data.map(mapAssignmentFromDb));
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

    setFsaTracts(prev => [...prev.filter(t => t.tractKey !== tractKey), newTract]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('fsa_tract_imports', existingTract ? 'update' : 'insert', {
          id, farm_id, tract_key: tractKey, filename, feature_count: featureCount,
          geojson, imported_at: newTract.importedAt, deleted_at: null,
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

    const persistedTract = mapTractFromDb(data as DbTractRow);
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
    const dbPayload = mapAssignmentToDb(newAssignment);

    setCluAssignments(prev => [...prev.filter(a => !(a.tractKey === tractKey && a.cluNumber === cluNumber)), newAssignment]);

    if (!isOnline) {
      try {
        await syncQueue.enqueueMutation('field_clu_assignments', existingAssignment ? 'update' : 'insert', dbPayload, farm_id);
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

    const persistedAssignment = mapAssignmentFromDb(data as DbAssignmentRow);
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
    const dbPayload = mapAssignmentToDb(updatedAssignment);

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

    const persistedAssignment = mapAssignmentFromDb(data as DbAssignmentRow);
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
    setCluAssignments(prev => prev.filter(
      a => !(a.fieldId === fieldId && a.tractKey === tractKey && a.cluNumber === cluNumber),
    ));

    if (!assignment) {
      toast.error('CLU assignment not found');
      return false;
    }

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

  return {
    fetchTractsAndAssignments,
    importTract,
    deleteTract,
    assignClu,
    updateCluLandUse,
    unassignClu,
  };
}
