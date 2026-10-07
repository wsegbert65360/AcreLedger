import { useCallback, useMemo } from 'react';
import {
  Field, Bin, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, CustomSprayRecord,
  FertilizerApplication, GrainMovement, SavedSeed, SprayRecipe, FertilizerRecipe, TillageRecord,
  WorkRequest
} from '@/types/farm';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';
import type { FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import {
  mapFieldToDb, mapBinToDb, mapPlantToDb, mapSprayToDb,
  mapHarvestToDb, mapHayToDb, mapCustomSprayToDb, mapGrainToDb, mapSeedToDb,
  mapRecipeToDb, mapFertilizerToDb, mapFertilizerRecipeToDb, mapTillageToDb,
  mapFsaTractToDb, mapFieldCluAssignmentToDb, mapWorkRequestToDb,
  mapEquipmentToDb, mapMaintenanceScheduleToDb, mapMaintenanceLogToDb,
} from '@/lib/mappers';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { exportDataAsJson } from '@/utils/backup';
import { backupSchema } from '@/lib/backupSchema';
import { CURRENT_BACKUP_VERSION, normalizeBackupForRestore } from '@/lib/backupCompatibility';
import { resolveRestoredBoundaryAcres } from '@/lib/fieldAcreage';
import {
  isNativeOfflineStoreUnavailable,
  isOfflineDatabaseUnavailableError,
  OFFLINE_STORE_UNAVAILABLE_MESSAGE,
  offlineStorage,
} from '@/lib/offlineStorage';
import { getMaxActiveSeason, isValidActiveSeason, MIN_SEASON_YEAR } from '@/lib/seasonYears';
import { syncQueue } from '@/lib/syncQueue';
import { setStorageLock } from './storageUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClearLocalCacheOptions = {
  /** Confirmed sign-out when the native store cannot be opened. Leaves the unreadable SQLite file on the device. */
  skipUnreadableOfflineStore?: boolean;
  /**
   * Clears only the offline cache keys (and per-table `al_<table>` keys).
   * Unlike the confirmed sign-out path, this never touches the encrypted sync
   * queue, so unsynced offline work is preserved on the device.
   */
  keepPendingSync?: boolean;
};

/**
 * Keys the cache-clear path may remove. It deliberately excludes the sync
 * queue (`al_sync_queue`) and its quarantine copy (`al_sync_queue_corrupt`),
 * which carry unsynced farmer work and another user's pending queue — those
 * are owned by the confirmed sign-out path only.
 *
 *   al_<table>                 legacy un-namespaced per-table cache
 *   <userId>_al_<table>        per-user per-table cache
 *   al_cache_*                 versioned cache metadata markers
 */
export function selectCacheKeysToRemove(
  allKeys: string[],
  userId: string | null,
): string[] {
  const userPrefix = userId ? `${userId}_al_` : null;
  return allKeys.filter(key => {
    if (key === syncQueue.SYNC_QUEUE_KEY || key === syncQueue.CORRUPT_QUEUE_KEY) return false;
    if (userPrefix && key.startsWith(userPrefix)) return true;
    if (key.startsWith('al_')) return true;
    return false;
  });
}

/** Enumerate every localStorage key in a way that works for both real Storage and test doubles. */
function listLocalStorageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * True when a queued mutation cannot be safely discarded: the user still has
 * pending offline work for the farm and the replay could not drain it.
 */
export function shouldRefuseCacheClear(pendingCount: number): boolean {
  return pendingCount > 0;
}

interface UseSeasonManagementArgs {
  session: Session | null | undefined;
  farm_id: string | null;
  fields: Field[];
  bins: Bin[];
  plantRecords: PlantRecord[];
  sprayRecords: SprayRecord[];
  harvestRecords: HarvestRecord[];
  hayHarvestRecords: HayHarvestRecord[];
  customSprayRecords: CustomSprayRecord[];
  fertilizerApplications: FertilizerApplication[];
  grainMovements: GrainMovement[];
  savedSeeds: SavedSeed[];
  fertilizerRecipes: FertilizerRecipe[];
  sprayRecipes: SprayRecipe[];
  tillageRecords: TillageRecord[];
  fsaTracts: FsaTractImport[];
  cluAssignments: FieldCluAssignment[];
  workRequests: WorkRequest[];
  equipment: Equipment[];
  maintenanceSchedules: MaintenanceSchedule[];
  maintenanceLogs: MaintenanceLog[];
  activeSeason: number;
  setActiveSeason: React.Dispatch<React.SetStateAction<number>>;
  setViewingSeason: React.Dispatch<React.SetStateAction<number>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  setBins: React.Dispatch<React.SetStateAction<Bin[]>>;
  setPlantRecords: React.Dispatch<React.SetStateAction<PlantRecord[]>>;
  setSprayRecords: React.Dispatch<React.SetStateAction<SprayRecord[]>>;
  setHarvestRecords: React.Dispatch<React.SetStateAction<HarvestRecord[]>>;
  setHayHarvestRecords: React.Dispatch<React.SetStateAction<HayHarvestRecord[]>>;
  setCustomSprayRecords: React.Dispatch<React.SetStateAction<CustomSprayRecord[]>>;
  setFertilizerApplications: React.Dispatch<React.SetStateAction<FertilizerApplication[]>>;
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
  setSavedSeeds: React.Dispatch<React.SetStateAction<SavedSeed[]>>;
  setFertilizerRecipes: React.Dispatch<React.SetStateAction<FertilizerRecipe[]>>;
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
  setTillageRecords: React.Dispatch<React.SetStateAction<TillageRecord[]>>;
  setFsaTracts: React.Dispatch<React.SetStateAction<FsaTractImport[]>>;
  setCluAssignments: React.Dispatch<React.SetStateAction<FieldCluAssignment[]>>;
  setWorkRequests: React.Dispatch<React.SetStateAction<WorkRequest[]>>;
  setEquipment: React.Dispatch<React.SetStateAction<Equipment[]>>;
  setMaintenanceSchedules: React.Dispatch<React.SetStateAction<MaintenanceSchedule[]>>;
  setMaintenanceLogs: React.Dispatch<React.SetStateAction<MaintenanceLog[]>>;
  setFarmId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Reload all farm entities from Supabase after restore (source of truth). */
  refetchFarmData: () => Promise<boolean>;
  isOnline: boolean;
  initialFetchComplete: boolean;
  fetchError: boolean;
  pendingSyncCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCurrentYear = () => new Date().getFullYear();

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSeasonManagement(args: UseSeasonManagementArgs) {
  const {
    session, farm_id,
    fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, customSprayRecords, fertilizerApplications, grainMovements,
    savedSeeds, fertilizerRecipes, sprayRecipes, tillageRecords,
    fsaTracts, cluAssignments, workRequests,
    equipment, maintenanceSchedules, maintenanceLogs, activeSeason,
    setActiveSeason, setViewingSeason, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setCustomSprayRecords, setFertilizerApplications,
    setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes,
    setTillageRecords, setFsaTracts, setCluAssignments, setWorkRequests,
    setEquipment, setMaintenanceSchedules, setMaintenanceLogs, setFarmId,
    refetchFarmData,
    isOnline, initialFetchComplete, fetchError, pendingSyncCount,
  } = args;

  // ─── Rollover ───────────────────────────────────────────────────────────────

  const rolloverToNewSeason = useCallback(async (year: number): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (!isOnline) {
      toast.error('Season rollover is not available offline. Please connect to the internet.');
      return false;
    }

    if (!session) {
      toast.error('Season rollover requires a signed-in user.');
      return false;
    }

    if (isNativeOfflineStoreUnavailable()) {
      toast.error(OFFLINE_STORE_UNAVAILABLE_MESSAGE);
      return false;
    }

    if (!initialFetchComplete || fetchError || pendingSyncCount > 0) {
      toast.error('Wait for cloud data and pending changes to finish syncing before rollover.');
      return false;
    }

    const maxSeasonYear = getMaxActiveSeason();
    if (!isValidActiveSeason(year)) {
      toast.error(`Invalid season year: ${year}. Must be between ${MIN_SEASON_YEAR} and ${maxSeasonYear}.`);
      return false;
    }

    if (year <= activeSeason) {
      toast.error(`The new season must be later than the active ${activeSeason} season.`);
      return false;
    }

    setLoading(true);
    try {
      // 1. Attempt backup FIRST — do not proceed if it fails
      const backupData = {
        backupVersion: CURRENT_BACKUP_VERSION,
        fields, bins, plantRecords, sprayRecords, harvestRecords,
        hayHarvestRecords, customSprayRecords, fertilizerApplications, tillageRecords, grainMovements,
        savedSeeds, fertilizerRecipes, sprayRecipes, fsaTracts, cluAssignments, workRequests,
        equipment, maintenanceSchedules, maintenanceLogs, activeSeason,
        rolloverDate: new Date().toISOString(),
      };
      const validatedBackup = backupSchema.parse(backupData);

      const filename = `Pre_Season_Reset_${new Date().toISOString().split('T')[0]}.json`;
      const downloaded = await exportDataAsJson(validatedBackup, filename);

      if (!downloaded) {
        toast.error('Could not create pre-rollover backup. Season was NOT changed.');
        return false;
      }

      // 2. Update Supabase first — if this fails, don't update local state
      const { error, count } = await supabase
        .from('profiles')
        .update({ active_season: year }, { count: 'exact' })
        .eq('id', session.user.id)
        .eq('farm_id', farm_id);

      if (error || count !== 1) {
        console.error('Error updating active season:', error ?? `Expected 1 profile, updated ${count ?? 0}`);
        toast.error('Failed to save new season to cloud. Season was NOT changed; your backup was downloaded.');
        return false;
      }

      // 3. Both backup and DB succeeded — now update local state
      setActiveSeason(year);
      setViewingSeason(year);
      toast.success(`Season rolled over to ${year}. Backup downloaded.`);
      return true;
    } catch (err) {
      console.error('Unexpected season rollover failure:', err);
      toast.error('Season was NOT changed because the backup or cloud update failed.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [
    session, fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, customSprayRecords, fertilizerApplications, tillageRecords, grainMovements,
    savedSeeds, fertilizerRecipes, sprayRecipes, fsaTracts, cluAssignments, workRequests,
    equipment, maintenanceSchedules, maintenanceLogs, activeSeason,
    isOnline, farm_id, initialFetchComplete, fetchError, pendingSyncCount,
    setActiveSeason, setViewingSeason, setLoading,
  ]);

  // ─── Restore ────────────────────────────────────────────────────────────────

  const restoreFromBackup = useCallback(async (rawData: unknown): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }

    if (!isOnline) {
      toast.error('Backup restore is not available offline. Please connect to the internet.');
      return false;
    }

    if (typeof rawData !== 'object' || rawData === null) {
      toast.error('Invalid backup file format.');
      return false;
    }

    setLoading(true);
    try {
      const backupData = backupSchema.parse(normalizeBackupForRestore(rawData));

      const { data: existingFieldRows, error: existingFieldsError } = await supabase
        .from('fields')
        .select('id, operational_acreage')
        .eq('farm_id', farm_id);
      if (existingFieldsError) {
        throw new Error(`Failed to protect existing boundary acreage: ${existingFieldsError.message}`);
      }
      const existingBoundaryByField = new Map(
        (existingFieldRows ?? []).map(row => [row.id, row.operational_acreage as number | null]),
      );
      const restoredAssignments = (backupData.cluAssignments ?? []) as FieldCluAssignment[];
      const fieldsToDb = (backupData.fields ?? []).map((f) => {
        const field = { ...f, farm_id } as unknown as Field;
        const operationalAcreage = resolveRestoredBoundaryAcres(
          field,
          restoredAssignments,
          existingBoundaryByField.get(field.id),
        );
        return {
          ...mapFieldToDb(field),
          operational_acreage: operationalAcreage,
        };
      });
      const binsToDb        = (backupData.bins                 ?? []).map((b) => mapBinToDb({ ...b, farm_id } as unknown as Bin));
      const plantsToDb      = (backupData.plantRecords         ?? []).map((r) => mapPlantToDb({ ...r, farm_id } as unknown as PlantRecord));
      const spraysToDb      = (backupData.sprayRecords         ?? []).map((r) => mapSprayToDb({ ...r, farm_id } as unknown as SprayRecord));
      const harvestsToDb    = (backupData.harvestRecords       ?? []).map((r) => mapHarvestToDb({ ...r, farm_id } as unknown as HarvestRecord));
      const hayToDb         = (backupData.hayHarvestRecords    ?? []).map((r) => mapHayToDb({ ...r, farm_id } as unknown as HayHarvestRecord));
      const customSprayToDb = (backupData.customSprayRecords   ?? []).map((r) => mapCustomSprayToDb({ ...r, farm_id } as unknown as CustomSprayRecord));
      const fertilizerToDb  = (backupData.fertilizerApplications ?? []).map((r) => mapFertilizerToDb({ ...r, farm_id } as unknown as FertilizerApplication));
      const tillageToDb     = (backupData.tillageRecords         ?? []).map((r) => mapTillageToDb({ ...r, farm_id } as unknown as TillageRecord));
      const grainToDb       = (backupData.grainMovements       ?? []).map((m) => mapGrainToDb({ ...m, farm_id } as unknown as GrainMovement));
      const seedsToDb       = (backupData.savedSeeds           ?? []).map((s) => mapSeedToDb({ ...s, farm_id } as unknown as SavedSeed));
      const fRecipesToDb    = (backupData.fertilizerRecipes    ?? []).map((r) => mapFertilizerRecipeToDb({ ...r, farm_id } as unknown as FertilizerRecipe));
      const recipesToDb     = (backupData.sprayRecipes         ?? []).map((r) => mapRecipeToDb({ ...r, farm_id } as unknown as SprayRecipe));
      const tractsToDb      = (backupData.fsaTracts            ?? []).map((t) => mapFsaTractToDb({ ...t, farmId: farm_id } as FsaTractImport));
      const assignmentsToDb = (backupData.cluAssignments       ?? []).map((a) => mapFieldCluAssignmentToDb({ ...a, farmId: farm_id } as FieldCluAssignment));
      const workRequestsToDb = (backupData.workRequests        ?? []).map((w) => mapWorkRequestToDb({ ...w, farm_id } as unknown as WorkRequest));
      const equipmentToDb = (backupData.equipment ?? []).map((row) => mapEquipmentToDb({ ...row, farm_id } as Equipment));
      const schedulesToDb = (backupData.maintenanceSchedules ?? []).map((row) => mapMaintenanceScheduleToDb({ ...row, farm_id } as MaintenanceSchedule));
      const logsToDb = (backupData.maintenanceLogs ?? []).map((row) => mapMaintenanceLogToDb({ ...row, farm_id } as MaintenanceLog));

      const payload = {
        fields: fieldsToDb,
        bins: binsToDb,
        plant_records: plantsToDb,
        spray_records: spraysToDb,
        harvest_records: harvestsToDb,
        hay_harvest_records: hayToDb,
        custom_spray_records: customSprayToDb,
        fertilizer_applications: fertilizerToDb,
        tillage_records: tillageToDb,
        grain_movements: grainToDb,
        saved_seeds: seedsToDb,
        fertilizer_recipes: fRecipesToDb,
        spray_recipes: recipesToDb,
        fsa_tract_imports: tractsToDb,
        field_clu_assignments: assignmentsToDb,
        work_requests: workRequestsToDb,
        equipment: equipmentToDb,
        maintenance_schedules: schedulesToDb,
        maintenance_logs: logsToDb,
      };

      if (backupData.activeSeason !== undefined) {
        if (!isValidActiveSeason(backupData.activeSeason)) {
          throw new Error(`Invalid season year in backup: ${backupData.activeSeason}`);
        }
      }

      const { error } = await supabase.rpc('restore_farm_backup', {
        p_payload: payload,
        p_active_season: backupData.activeSeason ?? null,
      });

      if (error) {
        throw new Error(`Failed to restore backup: ${error.message}`);
      }

      // Hydrate from Supabase (not raw backup) so UI, localStorage, and DB stay aligned.
      const reloaded = await refetchFarmData();
      if (!reloaded) {
        throw new Error(
          'Backup was saved to the cloud, but reload failed. Refresh the page to sync your data.'
        );
      }

      if (backupData.activeSeason !== undefined) {
        setActiveSeason(backupData.activeSeason);
        setViewingSeason(backupData.activeSeason);
      }

      toast.success('Backup restored successfully.');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during restore.';
      console.error('Restore failed:', err);
      toast.error(`Restore failed: ${message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [
    farm_id, isOnline, setLoading, refetchFarmData,
    setActiveSeason, setViewingSeason,
  ]);

  // ─── Clear Cache ─────────────────────────────────────────────────────────────

  const clearLocalCache = useCallback(async (options?: ClearLocalCacheOptions) => {
    setStorageLock(true);

    const userId = session?.user?.id;
    const skipUnreadableStore = options?.skipUnreadableOfflineStore === true
      && isNativeOfflineStoreUnavailable();
    // Only the confirmed sign-out path may discard a farm's pending queue.
    // A plain "Clear cache" preserves it so unsynced offline work survives.
    const isSignOut = options?.keepPendingSync !== true;

    if (isSignOut && farm_id) {
      try {
        if (!skipUnreadableStore) {
          await syncQueue.clearQueue(farm_id);
        }
      } catch (err) {
        if (options?.skipUnreadableOfflineStore && isOfflineDatabaseUnavailableError(err)) {
          // User confirmed leaving the unreadable store on this device.
        } else {
          console.error('Failed to clear offline sync queue:', err);
          setStorageLock(false);
          const message = isOfflineDatabaseUnavailableError(err)
            ? OFFLINE_STORE_UNAVAILABLE_MESSAGE
            : 'Could not clear pending offline work. Cache was not cleared; please try again.';
          toast.error(message);
          return false;
        }
      }
    } else if (isSignOut === false) {
      // Plain cache clear: never delete unsynced work. First try to drain it;
      // if anything remains queued (offline, transient failure, permanent
      // rejection), refuse so the farmer can decide, rather than silently
      // discarding it. The caller surfaces the discard confirmation.
      if (farm_id && !skipUnreadableStore) {
        let pending = 0;
        try {
          pending = await syncQueue.getPendingCount(farm_id);
        } catch (err) {
          console.error('Failed to read pending offline work count:', err);
          setStorageLock(false);
          toast.error('Could not check for unsynced work. Cache was not cleared; please try again.');
          return false;
        }
        if (shouldRefuseCacheClear(pending)) {
          try {
            await syncQueue.replayQueue(farm_id);
            pending = await syncQueue.getPendingCount(farm_id);
          } catch (err) {
            console.error('Failed to replay pending offline work before cache clear:', err);
          }
        }
        if (shouldRefuseCacheClear(pending)) {
          setStorageLock(false);
          toast.error('Unsynced offline work is still pending.', {
            description: `${pending} change${pending !== 1 ? 's' : ''} have not reached the cloud yet. Connect to the internet and sync, or sign out to discard them.`,
          });
          return false;
        }
      }
    }

    try {
      await offlineStorage.clearCache(userId ?? null);
    } catch (err) {
      console.error('Failed to clear SQLite cache:', err);
    }

    const keysToRemove = selectCacheKeysToRemove(listLocalStorageKeys(), userId ?? null);

    await new Promise<void>(resolve => {
      const batchRemove = (startIndex: number) => {
        const BATCH_SIZE = 100;
        const endIndex = Math.min(startIndex + BATCH_SIZE, keysToRemove.length);

        for (let i = startIndex; i < endIndex; i++) {
          localStorage.removeItem(keysToRemove[i]);
        }

        if (endIndex < keysToRemove.length) {
          requestAnimationFrame(() => batchRemove(endIndex));
        } else {
          resolve();
        }
      };

      batchRemove(0);
    });
    setStorageLock(false);

    setFields([]);
    setBins([]);
    setPlantRecords([]);
    setSprayRecords([]);
    setHarvestRecords([]);
    setHayHarvestRecords([]);
    setCustomSprayRecords([]);
    setFertilizerApplications([]);
    setGrainMovements([]);
    setSavedSeeds([]);
    setSprayRecipes([]);
    setFertilizerRecipes([]);
    setTillageRecords([]);
    setFsaTracts([]);
    setCluAssignments([]);
    setWorkRequests([]);
    setEquipment([]);
    setMaintenanceSchedules([]);
    setMaintenanceLogs([]);
    setActiveSeason(getCurrentYear());
    setViewingSeason(getCurrentYear());

    // Sign-out clears the farm scope (the session is ending). A plain cache
    // clear must NOT unset farm_id on a still-authenticated session — doing so
    // left the app looking empty and made writes fail with "No farm selected."
    // Instead re-derive scope so cached rows repopulate from the cloud.
    if (isSignOut) {
      setFarmId(null);
    } else if (farm_id) {
      void refetchFarmData();
    }

    if (!skipUnreadableStore) {
      toast.success(`Local cache cleared (${keysToRemove.length} item${keysToRemove.length !== 1 ? 's' : ''} removed).`);
    }
    return true;
  }, [
    session, farm_id,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setCustomSprayRecords, setFertilizerApplications,
    setTillageRecords, setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes,
    setFsaTracts, setCluAssignments, setWorkRequests,
    setEquipment, setMaintenanceSchedules, setMaintenanceLogs,
    setFarmId, setActiveSeason, setViewingSeason,
    refetchFarmData,
  ]);

  return useMemo(() => ({
    rolloverToNewSeason,
    restoreFromBackup,
    clearLocalCache
  }), [rolloverToNewSeason, restoreFromBackup, clearLocalCache]);
}
