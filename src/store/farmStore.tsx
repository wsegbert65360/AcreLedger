import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Field, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, Bin, GrainMovement, SavedSeed, SprayRecipe, FertilizerApplication } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import {
  mapFieldFromDb, mapBinFromDb, mapPlantFromDb, mapSprayFromDb,
  mapHarvestFromDb, mapHayFromDb, mapGrainFromDb, mapSeedFromDb, mapRecipeFromDb,
  mapFertilizerFromDb
} from '../lib/mappers';
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

interface FarmState {
  session: Session | null;
  loading: boolean;
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
  viewingSeason: number;
  setViewingSeason: (year: number) => void;
  rolloverToNewSeason: (year: number) => void;
  addPlantRecord: (r: Omit<PlantRecord, 'id' | 'timestamp'>) => void;
  updatePlantRecord: (r: PlantRecord) => void;
  addSprayRecord: (r: Omit<SprayRecord, 'id' | 'timestamp'>) => void;
  updateSprayRecord: (r: SprayRecord) => void;
  addHarvestRecord: (r: Omit<HarvestRecord, 'id' | 'timestamp'>) => void;
  updateHarvestRecord: (r: HarvestRecord) => void;
  addHayHarvestRecord: (r: Omit<HayHarvestRecord, 'id' | 'timestamp'>) => void;
  updateHayHarvestRecord: (r: HayHarvestRecord) => void;
  addFertilizerApplication: (r: Omit<FertilizerApplication, 'id' | 'created_at' | 'updated_at' | 'fieldName'>) => void;
  updateFertilizerApplication: (r: FertilizerApplication) => void;
  addGrainMovement: (r: Omit<GrainMovement, 'id'> & { timestamp?: number }) => void;
  updateGrainMovement: (r: GrainMovement) => void;
  deleteGrainMovements: (ids: string[]) => void;
  deletePlantRecords: (ids: string[]) => void;
  deleteSprayRecords: (ids: string[]) => void;
  deleteHarvestRecords: (ids: string[]) => void;
  deleteHayHarvestRecords: (ids: string[]) => void;
  deleteFertilizerApplications: (ids: string[]) => void;
  getBinTotal: (binId: string, season?: number) => number;
  addField: (f: Omit<Field, 'id'>) => void;
  updateField: (f: Field) => void;
  deleteField: (id: string) => void;
  addBin: (b: Omit<Bin, 'id'>) => void;
  updateBin: (b: Bin) => void;
  deleteBin: (id: string) => void;
  addSeed: (name: string) => void;
  deleteSeed: (id: string) => void;
  addSprayRecipe: (r: Omit<SprayRecipe, 'id'>) => void;
  updateSprayRecipe: (r: SprayRecipe) => void;
  deleteSprayRecipe: (id: string) => void;
  signOut: () => void;
  clearLocalCache: () => void;
  farm_id: string | null;
  restoreFromBackup: (data: any) => Promise<void>;
}

const FarmContext = createContext<FarmState | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  // --- Auth & Session ---
  const auth = useAuth();
  const {
    session, loading, setLoading,
    farm_id, setFarmId,
    activeSeason, setActiveSeason,
    viewingSeason, setViewingSeason,
  } = auth;

  // --- Data State ---
  const [fields, setFields] = useState<Field[]>(() => loadFromStorage('al_fields', []));
  const [bins, setBins] = useState<Bin[]>(() => loadFromStorage('al_bins', []));
  const [plantRecords, setPlantRecords] = useState<PlantRecord[]>(() => loadFromStorage('al_plant', []));
  const [sprayRecords, setSprayRecords] = useState<SprayRecord[]>(() => loadFromStorage('al_spray', []));
  const [harvestRecords, setHarvestRecords] = useState<HarvestRecord[]>(() => loadFromStorage('al_harvest', []));
  const [hayHarvestRecords, setHayHarvestRecords] = useState<HayHarvestRecord[]>(() => loadFromStorage('al_hay', []));
  const [fertilizerApplications, setFertilizerApplications] = useState<FertilizerApplication[]>(() => loadFromStorage('al_fertilizer', []));
  const [grainMovements, setGrainMovements] = useState<GrainMovement[]>(() => loadFromStorage('al_grain', []));
  const [savedSeeds, setSavedSeeds] = useState<SavedSeed[]>(() => loadFromStorage('al_seeds', []));
  const [sprayRecipes, setSprayRecipes] = useState<SprayRecipe[]>(() => loadFromStorage('al_recipes', []));

  // --- Fetch data when farm_id is stable ---
  useEffect(() => {
    if (session && farm_id) {
      const fetchData = async () => {
        setLoading(true);
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
            { data: grainData, error: grainErr },
            { data: seedsData, error: seedsErr },
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
            query('grain_movements'),
            query('saved_seeds'),
            query('spray_recipes')
          ]);

          const fetchErrors = [
            fieldsErr, binsErr, plantErr, sprayErr, harvestErr,
            hayErr, fertilizerErr, grainErr, seedsErr, recipesErr
          ].filter(Boolean);

          if (fetchErrors.length > 0) {
            console.error('Data fetch errors:', fetchErrors);
            toast.error('Some data failed to load from cloud. Showing local cache.');
          }

          if (fieldsData) setFields(fieldsData.map(mapFieldFromDb));
          if (binsData) setBins(binsData.map(mapBinFromDb));
          if (plantData) setPlantRecords(plantData.map(mapPlantFromDb));
          if (sprayData) setSprayRecords(sprayData.map(mapSprayFromDb));
          if (harvestData) setHarvestRecords(harvestData.map(mapHarvestFromDb));
          if (hayData) setHayHarvestRecords(hayData.map(mapHayFromDb));
          if (fertilizerData) setFertilizerApplications(fertilizerData.map(mapFertilizerFromDb));
          if (grainData) setGrainMovements(grainData.map(mapGrainFromDb));
          if (seedsData) setSavedSeeds(seedsData.map(mapSeedFromDb));
          if (recipesData) setSprayRecipes(recipesData.map(mapRecipeFromDb));

        } catch (error) {
          console.error('Error fetching data:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [session?.user?.id, farm_id, setLoading]);

  // --- Local storage persistence ---
  useEffect(() => { saveToStorage('al_fields', fields); }, [fields]);
  useEffect(() => { saveToStorage('al_bins', bins); }, [bins]);
  useEffect(() => { saveToStorage('al_plant', plantRecords); }, [plantRecords]);
  useEffect(() => { saveToStorage('al_spray', sprayRecords); }, [sprayRecords]);
  useEffect(() => { saveToStorage('al_harvest', harvestRecords); }, [harvestRecords]);
  useEffect(() => { saveToStorage('al_hay', hayHarvestRecords); }, [hayHarvestRecords]);
  useEffect(() => { saveToStorage('al_fertilizer', fertilizerApplications); }, [fertilizerApplications]);
  useEffect(() => { saveToStorage('al_grain', grainMovements); }, [grainMovements]);
  useEffect(() => { saveToStorage('al_seeds', savedSeeds); }, [savedSeeds]);
  useEffect(() => { saveToStorage('al_recipes', sprayRecipes); }, [sprayRecipes]);
  useEffect(() => { saveToStorage('al_active_season', activeSeason); }, [activeSeason]);
  useEffect(() => { saveToStorage('al_farm_id', farm_id); }, [farm_id]);

  // --- Compose CRUD hooks ---
  const plantOps = usePlantRecords({ farm_id, activeSeason, plantRecords, setPlantRecords });
  const sprayOps = useSprayRecords({ farm_id, activeSeason, sprayRecords, setSprayRecords });
  const harvestOps = useHarvestRecords({ farm_id, activeSeason, harvestRecords, setHarvestRecords });
  const hayOps = useHayRecords({ farm_id, activeSeason, hayHarvestRecords, setHayHarvestRecords });
  const fertilizerOps = useFertilizerRecords({ farm_id, activeSeason, fields, fertilizerApplications, setFertilizerApplications });
  const grainOps = useGrainMovements({ farm_id, activeSeason, grainMovements, setGrainMovements });

  const entityOps = useFieldsAndBins({
    farm_id, fields, setFields, bins, setBins,
    savedSeeds, setSavedSeeds, sprayRecipes, setSprayRecipes
  });

  const seasonOps = useSeasonManagement({
    session, farm_id,
    fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, fertilizerApplications, grainMovements,
    savedSeeds, sprayRecipes, activeSeason,
    setActiveSeason, setViewingSeason, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setFertilizerApplications,
    setGrainMovements, setSavedSeeds, setSprayRecipes, setFarmId,
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
      session, loading,
      fields: sortedFields,
      bins: filteredBins,
      plantRecords, sprayRecords, harvestRecords, hayHarvestRecords,
      fertilizerApplications,
      grainMovements,
      savedSeeds, sprayRecipes,
      activeSeason, viewingSeason, setViewingSeason,
      rolloverToNewSeason: seasonOps.rolloverToNewSeason,
      ...plantOps,
      ...sprayOps,
      ...harvestOps,
      ...hayOps,
      ...fertilizerOps,
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


export function useFarm() {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be inside FarmProvider');
  return ctx;
}
