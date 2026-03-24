import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Field, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, Bin, GrainMovement, SavedSeed, SprayRecipe, FertilizerApplication, FertilizerRecipe, TillageRecord } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import { mapFieldFromDb, mapBinFromDb, mapPlantFromDb, mapSprayFromDb,
  mapHarvestFromDb, mapHayFromDb, mapGrainFromDb, mapSeedFromDb, mapRecipeFromDb,
  mapFertilizerFromDb, mapFertilizerRecipeFromDb, mapTillageFromDb
} from '../lib/mappers';
import { FertilizerRecipeRow, TillageRecordRow } from '../types/database';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

import { loadFromStorage, saveToStorage } from './storageUtils';
import { useAuth } from './useAuth';
import { usePlantRecords } from './usePlantRecords';
import { useSprayRecords } from './useSprayRecords';
import { useHarvestRecords } from './useHarvestRecords';
import { useHayRecords } from './useHayRecords';
import { useFertilizerRecords } from './useFertilizerRecords';
import { useGrainMovements } from './useGrainMovements';
import { useFieldsAndBins } from './useFieldsAndBins';
import { useSeasonManagement } from './useSeasonManagement';
import { useTillageRecords } from './useTillageRecords';

/**
 * Represents the global state and operations for the AcreLedger application.
 */
interface FarmState {
  /** Current user session from Supabase */
  session: Session | null;
  /** Global loading state for data fetching */
  loading: boolean;
  /** Global error state for data fetching */
  fetchError: boolean;
  /** List of farm fields, filtered and sorted */
  fields: Field[];
  /** List of storage bins, filtered and sorted */
  bins: Bin[];
  /** Planting records for the selected season */
  plantRecords: PlantRecord[];
  /** Spray application records for the selected season */
  sprayRecords: SprayRecord[];
  /** Harvest production records for the selected season */
  harvestRecords: HarvestRecord[];
  /** Hay and forage harvest records */
  hayHarvestRecords: HayHarvestRecord[];
  /** Fertilizer application records */
  fertilizerApplications: FertilizerApplication[];
  /** Tillage records */
  tillageRecords: TillageRecord[];
  /** Grain inventory movements (in/out of bins) */
  grainMovements: GrainMovement[];
  /** List of saved seed varieties available for planting */
  savedSeeds: SavedSeed[];
  /** Pre-defined fertilizer recipes */
  fertilizerRecipes: FertilizerRecipe[];
  /** Pre-defined chemical recipes for spray applications */
  sprayRecipes: SprayRecipe[];
  /** The current chronological season year */
  activeSeason: number;
  /** The season year currently being viewed/edited */
  viewingSeason: number;
  /** Method to change the currently viewed season */
  setViewingSeason: (year: number) => void;
  /** Method to transition the entire farm state to a new season */
  rolloverToNewSeason: (year: number) => void;
  /** Operations for managing planting records */
  addPlantRecord: (r: Omit<PlantRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updatePlantRecord: (r: PlantRecord) => Promise<boolean>;
  deletePlantRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing spray application records */
  addSprayRecord: (r: Omit<SprayRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updateSprayRecord: (r: SprayRecord) => Promise<boolean>;
  deleteSprayRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing harvest production records */
  addHarvestRecord: (r: Omit<HarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updateHarvestRecord: (r: HarvestRecord) => Promise<boolean>;
  deleteHarvestRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing hay harvest records */
  addHayHarvestRecord: (r: Omit<HayHarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updateHayHarvestRecord: (r: HayHarvestRecord) => Promise<boolean>;
  deleteHayHarvestRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing fertilizer applications */
  addFertilizerApplication: (r: Omit<FertilizerApplication, 'id' | 'timestamp' | 'created_at' | 'updated_at' | 'fieldName' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updateFertilizerApplication: (r: FertilizerApplication) => Promise<boolean>;
  deleteFertilizerApplications: (ids: string[]) => Promise<boolean>;
  /** Operations for managing tillage records */
  addTillageRecord: (r: Omit<TillageRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updateTillageRecord: (r: TillageRecord) => Promise<boolean>;
  deleteTillageRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing grain inventory */
  addGrainMovement: (r: Omit<GrainMovement, 'id' | 'deleted_at' | 'seasonYear'> & { timestamp?: number }) => Promise<boolean>;
  updateGrainMovement: (r: GrainMovement) => Promise<boolean>;
  deleteGrainMovements: (ids: string[]) => Promise<boolean>;
  /** Calculation utility for bin inventory levels */
  getBinTotal: (binId: string, season?: number) => number;
  /** Operations for managing field definitions */
  addField: (f: Omit<Field, 'id'>) => void;
  updateField: (f: Field) => void;
  deleteField: (id: string) => void;
  /** Operations for managing bin definitions */
  addBin: (b: Omit<Bin, 'id'>) => void;
  updateBin: (b: Bin) => void;
  deleteBin: (id: string) => void;
  /** Operations for managing seed varieties */
  addSeed: (name: string) => void;
  deleteSeed: (id: string) => void;
  /** Operations for managing spray recipes */
  addSprayRecipe: (r: Omit<SprayRecipe, 'id'>) => void;
  updateSprayRecipe: (r: SprayRecipe) => void;
  deleteSprayRecipe: (id: string) => void;
  /** Operations for managing fertilizer recipes */
  addFertilizerRecipe: (r: Omit<FertilizerRecipe, 'id'>) => void;
  updateFertilizerRecipe: (r: FertilizerRecipe) => void;
  deleteFertilizerRecipe: (id: string) => void;
  /** Global sign out and cache clearing */
  signOut: () => void;
  /** Clears all local application storage */
  clearLocalCache: () => void;
  /** Unique ID for the current farm */
  farm_id: string | null;
  /** Restores the entire farm state from a JSON backup */
  restoreFromBackup: (data: any) => Promise<boolean>;
}

const FarmContext = createContext<FarmState | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  // --- Auth & Session ---
  const auth = useAuth();
  const [fetchError, setFetchError] = useState(false);
  const {
    session, loading, setLoading,
    farm_id, setFarmId,
    activeSeason, setActiveSeason,
    viewingSeason, setViewingSeason,
  } = auth;

  // --- Data State ---
  const [fields, setFields] = useState<Field[]>(() => loadFromStorage('al_fields', [], auth.session?.user?.id));
  const [bins, setBins] = useState<Bin[]>(() => loadFromStorage('al_bins', [], auth.session?.user?.id));
  const [plantRecords, setPlantRecords] = useState<PlantRecord[]>(() => loadFromStorage('al_plant', [], auth.session?.user?.id));
  const [sprayRecords, setSprayRecords] = useState<SprayRecord[]>(() => loadFromStorage('al_spray', [], auth.session?.user?.id));
  const [harvestRecords, setHarvestRecords] = useState<HarvestRecord[]>(() => loadFromStorage('al_harvest', [], auth.session?.user?.id));
  const [hayHarvestRecords, setHayHarvestRecords] = useState<HayHarvestRecord[]>(() => loadFromStorage('al_hay', [], auth.session?.user?.id));
  const [fertilizerApplications, setFertilizerApplications] = useState<FertilizerApplication[]>(() => loadFromStorage('al_fertilizer', [], auth.session?.user?.id));
  const [tillageRecords, setTillageRecords] = useState<TillageRecord[]>(() => loadFromStorage('al_tillage', [], auth.session?.user?.id));
  const [grainMovements, setGrainMovements] = useState<GrainMovement[]>(() => loadFromStorage('al_grain', [], auth.session?.user?.id));
  const [savedSeeds, setSavedSeeds] = useState<SavedSeed[]>(() => loadFromStorage('al_seeds', [], auth.session?.user?.id));
  const [fertilizerRecipes, setFertilizerRecipes] = useState<FertilizerRecipe[]>(() => loadFromStorage('al_f_recipes', [], auth.session?.user?.id));
  const [sprayRecipes, setSprayRecipes] = useState<SprayRecipe[]>(() => loadFromStorage('al_recipes', [], auth.session?.user?.id));

  // --- Fetch data when farm_id is stable ---
  useEffect(() => {
    if (session && farm_id) {
      const fetchData = async () => {
        setLoading(true);
        setFetchError(false);
        try {
          const query = (table: string) => supabase.from(table).select('*').eq('farm_id', farm_id).is('deleted_at', null);

          const [
            { data: fieldsData, error: fieldsErr },
            { data: binsData, error: binsErr },
            { data: plantData, error: plantErr },
            { data: sprayData, error: sprayErr },
            { data: harvestData, error: harvestErr },
            { data: hayData, error: hayErr },
            { data: fertilizerData, error: fertilizerErr },
            { data: tillageData, error: tillageErr },
            { data: grainData, error: grainErr },
            { data: seedsData, error: seedsErr },
            { data: fertilizerRecipesData, error: fertilizerRecipesErr },
            { data: recipesData, error: recipesErr }
          ] = await Promise.all([
            query('fields'),
            query('bins'),
            query('plant_records'),
            query('spray_records'),
            query('harvest_records'),
            query('hay_harvest_records'),
            supabase.from('fertilizer_applications')
              .select('*, fields(name)')
              .eq('farm_id', farm_id)
              .is('deleted_at', null),
            query('tillage_records'),
            query('grain_movements'),
            query('saved_seeds'),
            query('fertilizer_recipes'),
            query('spray_recipes')
          ]);

          const fetchErrors = [
            fieldsErr, binsErr, plantErr, sprayErr, harvestErr,
            hayErr, fertilizerErr, tillageErr, grainErr, seedsErr,
            fertilizerRecipesErr, recipesErr
          ].filter(Boolean);

          if (fetchErrors.length > 0) {
            console.error('Data fetch errors:', fetchErrors);
            setFetchError(true);
            toast.error('Some data failed to load from cloud. Showing local cache.');
          }

          if (fieldsData) setFields(fieldsData.map(mapFieldFromDb));
          if (binsData) setBins(binsData.map(mapBinFromDb));
          if (plantData) setPlantRecords(plantData.map(mapPlantFromDb));
          if (sprayData) setSprayRecords(sprayData.map(mapSprayFromDb));
          if (harvestData) setHarvestRecords(harvestData.map(mapHarvestFromDb));
          if (hayData) setHayHarvestRecords(hayData.map(mapHayFromDb));
          if (fertilizerData) setFertilizerApplications(fertilizerData.map(mapFertilizerFromDb));
          if (tillageData) setTillageRecords(tillageData.map(mapTillageFromDb));
          if (grainData) setGrainMovements(grainData.map(mapGrainFromDb));
          if (seedsData) setSavedSeeds(seedsData.map(mapSeedFromDb));
          if (fertilizerRecipesData) setFertilizerRecipes(fertilizerRecipesData.map(mapFertilizerRecipeFromDb));
          if (recipesData) setSprayRecipes(recipesData.map(mapRecipeFromDb));

        } catch (error) {
          console.error('Error fetching data:', error);
          setFetchError(true);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [session?.user?.id, farm_id, setLoading]);

  // --- Local storage persistence ---
  useEffect(() => { saveToStorage('al_fields', fields, session?.user?.id); }, [fields, session?.user?.id]);
  useEffect(() => { saveToStorage('al_bins', bins, session?.user?.id); }, [bins, session?.user?.id]);
  useEffect(() => { saveToStorage('al_plant', plantRecords, session?.user?.id); }, [plantRecords, session?.user?.id]);
  useEffect(() => { saveToStorage('al_spray', sprayRecords, session?.user?.id); }, [sprayRecords, session?.user?.id]);
  useEffect(() => { saveToStorage('al_harvest', harvestRecords, session?.user?.id); }, [harvestRecords, session?.user?.id]);
  useEffect(() => { saveToStorage('al_hay', hayHarvestRecords, session?.user?.id); }, [hayHarvestRecords, session?.user?.id]);
  useEffect(() => { saveToStorage('al_fertilizer', fertilizerApplications, session?.user?.id); }, [fertilizerApplications, session?.user?.id]);
  useEffect(() => { saveToStorage('al_tillage', tillageRecords, session?.user?.id); }, [tillageRecords, session?.user?.id]);
  useEffect(() => { saveToStorage('al_grain', grainMovements, session?.user?.id); }, [grainMovements, session?.user?.id]);
  useEffect(() => { saveToStorage('al_seeds', savedSeeds, session?.user?.id); }, [savedSeeds, session?.user?.id]);
  useEffect(() => { saveToStorage('al_f_recipes', fertilizerRecipes, session?.user?.id); }, [fertilizerRecipes, session?.user?.id]);
  useEffect(() => { saveToStorage('al_recipes', sprayRecipes, session?.user?.id); }, [sprayRecipes, session?.user?.id]);
  useEffect(() => { saveToStorage('al_active_season', activeSeason, session?.user?.id); }, [activeSeason, session?.user?.id]);
  useEffect(() => { saveToStorage('al_farm_id', farm_id, session?.user?.id); }, [farm_id, session?.user?.id]);

  // --- Compose CRUD hooks ---
  const plantOps = usePlantRecords({ farm_id, activeSeason, setPlantRecords });
  const sprayOps = useSprayRecords({ farm_id, activeSeason, setSprayRecords });
  const harvestOps = useHarvestRecords({ farm_id, activeSeason, setHarvestRecords });
  const hayOps = useHayRecords({ farm_id, activeSeason, setHayHarvestRecords });
  const fertilizerOps = useFertilizerRecords({ farm_id, activeSeason, fields, setFertilizerApplications });
  const tillageOps = useTillageRecords({ farm_id, activeSeason, setTillageRecords });
  const grainOps = useGrainMovements({ farm_id, activeSeason, grainMovements, setGrainMovements });

  const entityOps = useFieldsAndBins({
    farm_id, fields, setFields, bins, setBins,
    savedSeeds, setSavedSeeds, 
    fertilizerRecipes, setFertilizerRecipes,
    sprayRecipes, setSprayRecipes
  });

  const seasonOps = useSeasonManagement({
    session, farm_id,
    fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, fertilizerApplications, tillageRecords, grainMovements,
    savedSeeds, fertilizerRecipes, sprayRecipes, activeSeason,
    setActiveSeason, setViewingSeason, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setTillageRecords, setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes, setFarmId,
  });

  // --- Composed signOut (auth + cache clear) ---
  const signOut = useCallback(async () => {
    await auth.signOut();
    seasonOps.clearLocalCache();
  }, [auth, seasonOps]);

  // --- Derived data ---
  const sortedFields = useMemo(() =>
    [...fields]
      .filter(f => !f.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [fields]
  );

  const filteredBins = useMemo(() =>
    bins.filter(b => !b.deleted_at),
    [bins]
  );

  return (
    <FarmContext.Provider value={{
      session, loading, fetchError,
      fields: sortedFields,
      bins: filteredBins,
      plantRecords, sprayRecords, harvestRecords, hayHarvestRecords,
      fertilizerApplications,
      tillageRecords,
      grainMovements,
      savedSeeds,
      fertilizerRecipes,
      sprayRecipes,
      activeSeason, viewingSeason, setViewingSeason,
      rolloverToNewSeason: seasonOps.rolloverToNewSeason,
      ...plantOps,
      ...sprayOps,
      ...harvestOps,
      ...hayOps,
      ...fertilizerOps,
      ...tillageOps,
      ...grainOps,
      ...entityOps,
      signOut,
      clearLocalCache: seasonOps.clearLocalCache,
      farm_id,
      restoreFromBackup: seasonOps.restoreFromBackup,
    }}>
      {children}
    </FarmContext.Provider>
  );
}


/**
 * Custom hook to access the global farm state and operations.
 * Must be used within a FarmProvider.
 */
export function useFarm() {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be inside FarmProvider');
  return ctx;
}
