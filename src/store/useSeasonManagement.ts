import { useCallback } from 'react';
import { Field, Bin, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, FertilizerApplication, GrainMovement, SavedSeed, SprayRecipe } from '@/types/farm';
import {
  mapFieldToDb, mapBinToDb, mapPlantToDb, mapSprayToDb,
  mapHarvestToDb, mapHayToDb, mapGrainToDb, mapSeedToDb, mapRecipeToDb,
  mapFertilizerToDb
} from '@/lib/mappers';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { backupSchema } from '@/lib/backupSchema';

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
  sprayRecipes: SprayRecipe[];
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
  setSprayRecipes: React.Dispatch<React.SetStateAction<SprayRecipe[]>>;
  setFarmId: React.Dispatch<React.SetStateAction<string | null>>;
}

const DEFAULT_FIELDS: Field[] = [];
const DEFAULT_BINS: Bin[] = [];

export function useSeasonManagement(args: UseSeasonManagementArgs) {
  const {
    session, farm_id,
    fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, fertilizerApplications, grainMovements,
    savedSeeds, sprayRecipes, activeSeason,
    setActiveSeason, setViewingSeason, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setGrainMovements, setSavedSeeds, setSprayRecipes, setFarmId,
  } = args;

  const rolloverToNewSeason = useCallback(async (year: number) => {
    // 1. Force Backup (JSON export)
    const backupData = {
      fields, bins, plantRecords, sprayRecords, harvestRecords, hayHarvestRecords,
      fertilizerApplications, grainMovements, savedSeeds, sprayRecipes, activeSeason,
      rolloverDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pre_Season_Reset_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 2. Update active season in local state and Supabase
    setActiveSeason(year);
    setViewingSeason(year);

    if (session) {
      const { error } = await supabase
        .from('profiles')
        .update({ active_season: year })
        .eq('id', session.user.id);
      if (error) console.error('Error updating active season:', error);
    }
  }, [session, fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, fertilizerApplications, grainMovements, savedSeeds,
    sprayRecipes, activeSeason, setActiveSeason, setViewingSeason]);

  const restoreFromBackup = useCallback(async (rawData: any) => {
    if (!farm_id) {
      console.error('Cannot restore: No farm_id found');
      return;
    }

    setLoading(true);
    try {
      const backupData = backupSchema.parse(rawData);
      // 1. Map data back to DB format
      const fieldsToDb = (backupData.fields || []).map((f: any) => ({ ...mapFieldToDb(f), farm_id }));
      const binsToDb = (backupData.bins || []).map((b: any) => ({ ...mapBinToDb(b), farm_id }));
      const plantsToDb = (backupData.plantRecords || []).map((r: any) => ({ ...mapPlantToDb(r), farm_id }));
      const spraysToDb = (backupData.sprayRecords || []).map((r: any) => ({ ...mapSprayToDb(r), farm_id }));
      const harvestsToDb = (backupData.harvestRecords || []).map((r: any) => ({ ...mapHarvestToDb(r), farm_id }));
      const hayToDb = (backupData.hayHarvestRecords || []).map((r: any) => ({ ...mapHayToDb(r), farm_id }));
      const fertilizerToDb = (backupData.fertilizerApplications || []).map((r: any) => ({ ...mapFertilizerToDb(r), farm_id }));
      const grainToDb = (backupData.grainMovements || []).map((m: any) => ({ ...mapGrainToDb(m), farm_id }));
      const seedsToDb = (backupData.savedSeeds || []).map((s: any) => ({ ...mapSeedToDb(s), farm_id }));
      const recipesToDb = (backupData.sprayRecipes || []).map((r: any) => ({ ...mapRecipeToDb(r), farm_id }));

      // 2. Perform bulk upserts
      const upsert = async (table: string, data: any[]) => {
        if (data.length === 0) return;
        const { error } = await supabase.from(table).upsert(data);
        if (error) throw error;
      };

      await Promise.all([
        upsert('fields', fieldsToDb),
        upsert('bins', binsToDb),
        upsert('plant_records', plantsToDb),
        upsert('spray_records', spraysToDb),
        upsert('harvest_records', harvestsToDb),
        upsert('hay_harvest_records', hayToDb),
        upsert('fertilizer_applications', fertilizerToDb),
        upsert('grain_movements', grainToDb),
        upsert('saved_seeds', seedsToDb),
        upsert('spray_recipes', recipesToDb)
      ]);

      // 3. Update local state
      if (backupData.fields) setFields(backupData.fields);
      if (backupData.bins) setBins(backupData.bins);
      if (backupData.plantRecords) setPlantRecords(backupData.plantRecords);
      if (backupData.sprayRecords) setSprayRecords(backupData.sprayRecords);
      if (backupData.harvestRecords) setHarvestRecords(backupData.harvestRecords);
      if (backupData.hayHarvestRecords) setHayHarvestRecords(backupData.hayHarvestRecords);
      if (backupData.fertilizerApplications) setFertilizerApplications(backupData.fertilizerApplications);
      if (backupData.grainMovements) setGrainMovements(backupData.grainMovements);
      if (backupData.savedSeeds) setSavedSeeds(backupData.savedSeeds);
      if (backupData.sprayRecipes) setSprayRecipes(backupData.sprayRecipes);
      if (backupData.activeSeason) {
        setActiveSeason(backupData.activeSeason);
        setViewingSeason(backupData.activeSeason);
      }

      toast.success("Backup restored successfully!");
    } catch (err) {
      console.error('Restore failed:', err);
      toast.error("Restore failed — check console for details");
    } finally {
      setLoading(false);
    }
  }, [farm_id, setLoading, setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setGrainMovements, setSavedSeeds, setSprayRecipes, setActiveSeason, setViewingSeason]);

  const clearLocalCache = useCallback(() => {
    const userPrefix = session?.user?.id ? `${session.user.id}_al_` : null;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('al_') || (userPrefix && key.startsWith(userPrefix))) {
        localStorage.removeItem(key);
      }
    });
    // Reset local state to defaults
    setFields(DEFAULT_FIELDS);
    setBins(DEFAULT_BINS);
    setPlantRecords([]);
    setSprayRecords([]);
    setHarvestRecords([]);
    setHayHarvestRecords([]);
    setFertilizerApplications([]);
    setGrainMovements([]);
    setSavedSeeds([]);
    setSprayRecipes([]);
    setFarmId(null);
    setActiveSeason(new Date().getFullYear());
    setViewingSeason(new Date().getFullYear());
    toast.success('Local cache cleared');
  }, [setFields, setBins, setPlantRecords, setSprayRecords, setHarvestRecords,
    setHayHarvestRecords, setFertilizerApplications, setGrainMovements,
    setSavedSeeds, setSprayRecipes, setFarmId, setActiveSeason, setViewingSeason]);

  return { rolloverToNewSeason, restoreFromBackup, clearLocalCache };
}
