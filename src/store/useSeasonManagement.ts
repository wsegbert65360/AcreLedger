import { useCallback, useMemo } from 'react';
import {
  Field, Bin, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord,
  FertilizerApplication, GrainMovement, SavedSeed, SprayRecipe, FertilizerRecipe, TillageRecord
} from '@/types/farm';
import {
  mapFieldToDb, mapBinToDb, mapPlantToDb, mapSprayToDb,
  mapHarvestToDb, mapHayToDb, mapGrainToDb, mapSeedToDb,
  mapRecipeToDb, mapFertilizerToDb, mapFertilizerRecipeToDb, mapTillageToDb
} from '@/lib/mappers';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { exportDataAsJson } from '@/utils/backup';
import { backupSchema } from '@/lib/backupSchema';
import { setStorageLock } from './storageUtils';
import { offlineStorage } from '@/lib/offlineStorage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSeasonManagementArgs {
  session: Session | null | undefined;
  farm_id: string | null;
  fields: Field[];
  bins: Bin[];
  plantRecords: PlantRecord[];
  sprayRecords: SprayRecord[];
  harvestRecords: HarvestRecord[];
  hayHarvestRecords: HayHarvestRecord[];
  fertilizerApplications: FertilizerApplication[];
  grainMovements: GrainMovement[];
  savedSeeds: SavedSeed[];
  fertilizerRecipes: FertilizerRecipe[];
  sprayRecipes: SprayRecipe[];
  tillageRecords: TillageRecord[];
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
  setFertilizerApplications: React.Dispatch<React.SetStateAction<FertilizerApplication[]>>;
  setGrainMovements: React.Dispatch<React.SetStateAction<GrainMovement[]>>;
  setSavedSeeds: React.Dispatch<React.SetStateAction<SavedSeed[]>>;
  setFertilizerRecipes: React.Dispatch<React.SetStateAction<FertilizerRecipe[]>>;
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
  setTillageRecords: React.Dispatch<React.SetStateAction<TillageRecord[]>>;
  setFarmId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Reload all farm entities from Supabase after restore (source of truth). */
  refetchFarmData: () => Promise<boolean>;
  isOnline: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCurrentYear = () => new Date().getFullYear();
const MIN_SEASON_YEAR = 2000;

function isValidYear(year: number): boolean {
  const maxSeasonYear = new Date().getFullYear() + 1;
  return Number.isInteger(year) && year >= MIN_SEASON_YEAR && year <= maxSeasonYear;
}


// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSeasonManagement(args: UseSeasonManagementArgs) {
  const {
    session, farm_id,
    fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, fertilizerApplications, grainMovements,
    savedSeeds, fertilizerRecipes, sprayRecipes, tillageRecords, activeSeason,
    setActiveSeason, setViewingSeason, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes,
    setTillageRecords, setFarmId,
    refetchFarmData,
    isOnline,
  } = args;

  // ─── Rollover ───────────────────────────────────────────────────────────────

  const rolloverToNewSeason = useCallback(async (year: number): Promise<boolean> => {
    if (!isOnline) {
      toast.error('Season rollover is not available offline. Please connect to the internet.');
      return false;
    }

    const maxSeasonYear = new Date().getFullYear() + 1;
    if (!isValidYear(year)) {
      toast.error(`Invalid season year: ${year}. Must be between ${MIN_SEASON_YEAR} and ${maxSeasonYear}.`);
      return false;
    }

    setLoading(true);
    try {
      // 1. Attempt backup FIRST — do not proceed if it fails
      const backupData = {
        fields, bins, plantRecords, sprayRecords, harvestRecords,
        hayHarvestRecords, fertilizerApplications, tillageRecords, grainMovements,
        savedSeeds, fertilizerRecipes, sprayRecipes, activeSeason,
        rolloverDate: new Date().toISOString(),
      };

      const filename = `Pre_Season_Reset_${new Date().toISOString().split('T')[0]}.json`;
      const downloaded = await exportDataAsJson(backupData, filename);

      if (!downloaded) {
        toast.error('Could not create pre-rollover backup. Season was NOT changed.');
        return false;
      }

      // 2. Update Supabase first — if this fails, don't update local state
      if (session) {
        const { error } = await supabase
          .from('profiles')
          .update({ active_season: year })
          .eq('id', session.user.id);

        if (error) {
          console.error('Error updating active season:', error);
          toast.error('Failed to save new season to cloud. Season was NOT changed.');
          return false;
        }
      }

      // 3. Both backup and DB succeeded — now update local state
      setActiveSeason(year);
      setViewingSeason(year);
      toast.success(`Season rolled over to ${year}. Backup downloaded.`);
      return true;
    } finally {
      setLoading(false);
    }
  }, [
    session, fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, fertilizerApplications, tillageRecords, grainMovements,
    savedSeeds, fertilizerRecipes, sprayRecipes, activeSeason,
    setActiveSeason, setViewingSeason, setLoading,
  ]);

  // ─── Restore ────────────────────────────────────────────────────────────────

  const restoreFromBackup = useCallback(async (rawData: unknown): Promise<boolean> => {
    if (!isOnline) {
      toast.error('Backup restore is not available offline. Please connect to the internet.');
      return false;
    }

    if (!farm_id) {
      toast.error('Cannot restore: no farm selected.');
      return false;
    }

    if (typeof rawData !== 'object' || rawData === null) {
      toast.error('Invalid backup file format.');
      return false;
    }

    setLoading(true);
    try {
      const backupData = backupSchema.parse(rawData);

      const fieldsToDb      = (backupData.fields               ?? []).map((f) => mapFieldToDb({ ...f, farm_id }));
      const binsToDb        = (backupData.bins                 ?? []).map((b) => mapBinToDb({ ...b, farm_id }));
      const plantsToDb      = (backupData.plantRecords         ?? []).map((r) => mapPlantToDb({ ...r, farm_id }));
      const spraysToDb      = (backupData.sprayRecords         ?? []).map((r) => mapSprayToDb({ ...r, farm_id }));
      const harvestsToDb    = (backupData.harvestRecords       ?? []).map((r) => mapHarvestToDb({ ...r, farm_id }));
      const hayToDb         = (backupData.hayHarvestRecords    ?? []).map((r) => mapHayToDb({ ...r, farm_id }));
      const fertilizerToDb  = (backupData.fertilizerApplications ?? []).map((r) => mapFertilizerToDb({ ...r, farm_id }));
      const tillageToDb     = (backupData.tillageRecords         ?? []).map((r) => mapTillageToDb({ ...r, farm_id }));
      const grainToDb       = (backupData.grainMovements       ?? []).map((m) => mapGrainToDb({ ...m, farm_id }));
      const seedsToDb       = (backupData.savedSeeds           ?? []).map((s) => mapSeedToDb({ ...s, farm_id }));
      const fRecipesToDb    = (backupData.fertilizerRecipes    ?? []).map((r) => mapFertilizerRecipeToDb({ ...r, farm_id }));
      const recipesToDb     = (backupData.sprayRecipes         ?? []).map((r) => mapRecipeToDb({ ...r, farm_id }));

      const payload = {
        fields: fieldsToDb,
        bins: binsToDb,
        plant_records: plantsToDb,
        spray_records: spraysToDb,
        harvest_records: harvestsToDb,
        hay_harvest_records: hayToDb,
        fertilizer_applications: fertilizerToDb,
        tillage_records: tillageToDb,
        grain_movements: grainToDb,
        saved_seeds: seedsToDb,
        fertilizer_recipes: fRecipesToDb,
        spray_recipes: recipesToDb,
      };

      const { error } = await supabase.rpc('restore_farm_backup', {
        p_payload: payload,
        p_active_season: backupData.activeSeason ?? null,
      });

      if (error) {
        throw new Error(`Failed to restore backup: ${error.message}`);
      }

      if (backupData.activeSeason !== undefined) {
        setActiveSeason(backupData.activeSeason);
        setViewingSeason(backupData.activeSeason);
      }

      // Hydrate from Supabase (not raw backup) so UI, localStorage, and DB stay aligned.
      const reloaded = await refetchFarmData();
      if (!reloaded) {
        throw new Error(
          'Backup was saved to the cloud, but reload failed. Refresh the page to sync your data.'
        );
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
    farm_id, setLoading, refetchFarmData,
    setActiveSeason, setViewingSeason,
  ]);

  // ─── Clear Cache ─────────────────────────────────────────────────────────────

  const clearLocalCache = useCallback(async () => {
    setStorageLock(true);
    
    const userId = session?.user?.id;
    const userPrefix = userId ? `${userId}_al_` : null;

    try {
      await offlineStorage.clearCache(userId);
    } catch (err) {
      console.error('Failed to clear SQLite cache:', err);
    }

    const keysToRemove = Object.keys(localStorage).filter(key =>
      key.startsWith('al_') || (userPrefix && key.startsWith(userPrefix))
    );

    const batchRemove = (keys: string[], startIndex: number = 0) => {
      const BATCH_SIZE = 100;
      const endIndex = Math.min(startIndex + BATCH_SIZE, keys.length);

      for (let i = startIndex; i < endIndex; i++) {
        localStorage.removeItem(keys[i]);
      }

      if (endIndex < keys.length) {
        requestAnimationFrame(() => batchRemove(keys, endIndex));
      } else {
        setStorageLock(false);
      }
    };

    if (keysToRemove.length > 0) {
      batchRemove(keysToRemove);
    } else {
      setStorageLock(false);
    }

    setFields([]);
    setBins([]);
    setPlantRecords([]);
    setSprayRecords([]);
    setHarvestRecords([]);
    setHayHarvestRecords([]);
    setFertilizerApplications([]);
    setGrainMovements([]);
    setSavedSeeds([]);
    setSprayRecipes([]);
    setFertilizerRecipes([]);
    setTillageRecords([]);
    setFarmId(null);
    setActiveSeason(getCurrentYear());
    setViewingSeason(getCurrentYear());

    toast.success(`Local cache cleared (${keysToRemove.length} item${keysToRemove.length !== 1 ? 's' : ''} removed).`);
  }, [
    session,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setTillageRecords, setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes,
    setFarmId, setActiveSeason, setViewingSeason,
  ]);

  return useMemo(() => ({
    rolloverToNewSeason,
    restoreFromBackup,
    clearLocalCache
  }), [rolloverToNewSeason, restoreFromBackup, clearLocalCache]);
}
