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

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseSeasonManagementArgs {
  session: Session | null;
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCurrentYear = () => new Date().getFullYear();
export const MIN_SEASON_YEAR = 2000;
export const MAX_SEASON_YEAR = getCurrentYear() + 1;

function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_SEASON_YEAR && year <= MAX_SEASON_YEAR;
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
  } = args;

  // ─── Rollover ───────────────────────────────────────────────────────────────

  const rolloverToNewSeason = useCallback(async (year: number): Promise<boolean> => {
    if (!isValidYear(year)) {
      toast.error(`Invalid season year: ${year}. Must be between ${MIN_SEASON_YEAR} and ${MAX_SEASON_YEAR}.`);
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
      const downloaded = exportDataAsJson(backupData, filename);

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
          // Replace with Sentry.captureException(error) in production
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
      // 1. Validate schema with strict per-table type checking
      const backupData = backupSchema.parse(rawData);

      // 2. Safety net: auto-backup current state before restoring.
      //    If the restore fails partway through, the user has a recovery point.
      const preRestoreBackup = {
        fields, bins, plantRecords, sprayRecords, harvestRecords,
        hayHarvestRecords, fertilizerApplications, tillageRecords, grainMovements,
        savedSeeds, fertilizerRecipes, sprayRecipes, activeSeason,
        rolloverDate: new Date().toISOString(),
        _preRestoreMarker: true,
      };
      const preRestoreBlob = new Blob([JSON.stringify(preRestoreBackup)], { type: 'application/json' });
      const preRestoreUrl = URL.createObjectURL(preRestoreBlob);
      const preRestoreLink = document.createElement('a');
      preRestoreLink.href = preRestoreUrl;
      preRestoreLink.download = `PRE_RESTORE_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(preRestoreLink);
      preRestoreLink.click();
      document.body.removeChild(preRestoreLink);
      setTimeout(() => URL.revokeObjectURL(preRestoreUrl), 2000);

      // 3. Map all records to DB format
      const fieldsToDb      = (backupData.fields               ?? []).map((f) => ({ ...mapFieldToDb(f),      farm_id }));
      const binsToDb        = (backupData.bins                 ?? []).map((b) => ({ ...mapBinToDb(b),        farm_id }));
      const plantsToDb      = (backupData.plantRecords         ?? []).map((r) => ({ ...mapPlantToDb(r),      farm_id }));
      const spraysToDb      = (backupData.sprayRecords         ?? []).map((r) => ({ ...mapSprayToDb(r),      farm_id }));
      const harvestsToDb    = (backupData.harvestRecords       ?? []).map((r) => ({ ...mapHarvestToDb(r),    farm_id }));
      const hayToDb         = (backupData.hayHarvestRecords    ?? []).map((r) => ({ ...mapHayToDb(r),        farm_id }));
      const fertilizerToDb  = (backupData.fertilizerApplications ?? []).map((r) => ({ ...mapFertilizerToDb(r), farm_id }));
      const tillageToDb     = (backupData.tillageRecords         ?? []).map((r) => ({ ...mapTillageToDb(r),    farm_id }));
      const grainToDb       = (backupData.grainMovements       ?? []).map((m) => ({ ...mapGrainToDb(m),      farm_id }));
      const seedsToDb       = (backupData.savedSeeds           ?? []).map((s) => ({ ...mapSeedToDb(s),       farm_id }));
      const fRecipesToDb    = (backupData.fertilizerRecipes    ?? []).map((r) => ({ ...mapFertilizerRecipeToDb(r), farm_id }));
      const recipesToDb     = (backupData.sprayRecipes         ?? []).map((r) => ({ ...mapRecipeToDb(r),     farm_id }));

      // 4. Upsert in batches to respect foreign key constraints while maintaining performance.
      //    Note: a server-side atomic transaction would be ideal, but for now we batch
      //    parents before children.
      const parentTables: [string, unknown[]][] = [
        ['fields',             fieldsToDb],
        ['bins',               binsToDb],
        ['saved_seeds',        seedsToDb],
        ['fertilizer_recipes', fRecipesToDb],
        ['spray_recipes',      recipesToDb],
      ];

      const childTables: [string, unknown[]][] = [
        ['plant_records',           plantsToDb],
        ['spray_records',           spraysToDb],
        ['harvest_records',         harvestsToDb],
        ['hay_harvest_records',     hayToDb],
        ['fertilizer_applications', fertilizerToDb],
        ['tillage_records',         tillageToDb],
        ['grain_movements',         grainToDb],
      ];

      const upsertTable = async (table: string, data: unknown[]) => {
        if (data.length === 0) return;
        const { error } = await supabase.from(table).upsert(data);
        if (error) {
          console.error(`Restore failed on table "${table}":`, error);
          throw new Error(`Failed to restore "${table}": ${error.message}. Use the PRE_RESTORE_BACKUP file to recover.`);
        }
      };

      // Upsert parents first (parallel), then children (parallel)
      await Promise.all(parentTables.map(([table, data]) => upsertTable(table, data)));
      await Promise.all(childTables.map(([table, data]) => upsertTable(table, data)));

      // 4. All DB writes succeeded — update local state in one pass.
      //    Use !== undefined (not falsy) so empty arrays are applied correctly.
      if (backupData.fields               !== undefined) setFields(backupData.fields);
      if (backupData.bins                 !== undefined) setBins(backupData.bins);
      if (backupData.plantRecords         !== undefined) setPlantRecords(backupData.plantRecords);
      if (backupData.sprayRecords         !== undefined) setSprayRecords(backupData.sprayRecords);
      if (backupData.harvestRecords       !== undefined) setHarvestRecords(backupData.harvestRecords);
      if (backupData.hayHarvestRecords    !== undefined) setHayHarvestRecords(backupData.hayHarvestRecords);
      if (backupData.fertilizerApplications !== undefined) setFertilizerApplications(backupData.fertilizerApplications);
      if (backupData.tillageRecords         !== undefined) setTillageRecords(backupData.tillageRecords);
      if (backupData.grainMovements       !== undefined) setGrainMovements(backupData.grainMovements);
      if (backupData.savedSeeds           !== undefined) setSavedSeeds(backupData.savedSeeds);
      if (backupData.fertilizerRecipes    !== undefined) setFertilizerRecipes(backupData.fertilizerRecipes);
      if (backupData.sprayRecipes         !== undefined) setSprayRecipes(backupData.sprayRecipes);
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
    farm_id, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setTillageRecords, setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes,
    setActiveSeason, setViewingSeason,
  ]);

  // ─── Clear Cache ─────────────────────────────────────────────────────────────

  const clearLocalCache = useCallback(() => {
    // session is read at call time via args — not a stale closure risk
    // because this function is recreated whenever session changes (it's in deps via args).
    const userId = session?.user?.id;
    const userPrefix = userId ? `${userId}_al_` : null;

    // Object.keys returns a snapshot — safe to remove keys while iterating
    const keysToRemove = Object.keys(localStorage).filter(key =>
      key.startsWith('al_') || (userPrefix && key.startsWith(userPrefix))
    );

    // Batch the removal to avoid synchronous blocking of the main thread
    const batchRemove = (keys: string[], startIndex: number = 0) => {
      const BATCH_SIZE = 100;
      const endIndex = Math.min(startIndex + BATCH_SIZE, keys.length);

      for (let i = startIndex; i < endIndex; i++) {
        localStorage.removeItem(keys[i]);
      }

      if (endIndex < keys.length) {
        requestAnimationFrame(() => batchRemove(keys, endIndex));
      }
    };

    if (keysToRemove.length > 0) {
      batchRemove(keysToRemove);
    }

    // Reset all local state in one logical pass
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