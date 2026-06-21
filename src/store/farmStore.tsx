import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import { Field, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, Bin, GrainMovement, SavedSeed, SprayRecipe, FertilizerApplication, FertilizerRecipe, TillageRecord } from '@/types/farm';
import { CluLandUse, FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import { supabase } from '@/lib/supabase';
import { mapFieldFromDb, mapBinFromDb, mapPlantFromDb, mapSprayFromDb,
  mapHarvestFromDb, mapHayFromDb, mapGrainFromDb, mapSeedFromDb, mapRecipeFromDb,
  mapFertilizerFromDb, mapFertilizerRecipeFromDb, mapTillageFromDb
} from '../lib/mappers';
// Database row types are handled via mappers
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

import { saveToStorage } from './storageUtils';
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
import { mapAssignmentFromDb, mapTractFromDb, useFsaTracts } from './useFsaTracts';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { offlineStorage } from '../lib/offlineStorage';
import { syncQueue } from '../lib/syncQueue';

/**
 * Represents the global state and operations for the AcreLedger application.
 */
interface FarmState {
  /** Current user session from Supabase */
  session: Session | null | undefined;
  /** Whether the device is online */
  isOnline: boolean;
  /** Number of pending operations in the sync queue */
  pendingSyncCount: number;
  /** Global loading state for data fetching */
  loading: boolean;
  /** True once the initial data load has settled for the current session (online fetch when online, cache hydration when offline). Gates decisions that must not race with the transient empty-fields render. */
  initialFetchComplete: boolean;
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
  /** Imported FSA tract boundary data */
  fsaTracts: FsaTractImport[];
  /** CLU-to-field assignment records */
  cluAssignments: FieldCluAssignment[];
  /** The current chronological season year */
  activeSeason: number;
  /** The season year currently being viewed/edited */
  viewingSeason: number;
  /** Dynamically computed list of seasons for filtering/selection */
  seasonOptions: number[];
  /** Method to change the currently viewed season */
  setViewingSeason: (year: number) => void;
  /** Method to transition the entire farm state to a new season */
  rolloverToNewSeason: (year: number) => Promise<boolean>;
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
  addFertilizerApplication: (r: Omit<FertilizerApplication, 'id' | 'timestamp' | 'created_at' | 'updated_at' | 'fieldName' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updateFertilizerApplication: (r: FertilizerApplication) => Promise<boolean>;
  deleteFertilizerApplications: (ids: string[]) => Promise<boolean>;
  /** Operations for managing tillage records */
  addTillageRecord: (r: Omit<TillageRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear'>) => Promise<boolean>;
  updateTillageRecord: (r: TillageRecord) => Promise<boolean>;
  deleteTillageRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing grain inventory */
  addGrainMovement: (r: Omit<GrainMovement, 'id' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { timestamp?: number }) => Promise<boolean>;
  updateGrainMovement: (r: GrainMovement) => Promise<boolean>;
  deleteGrainMovements: (ids: string[]) => Promise<boolean>;
  /** Calculation utility for bin inventory levels */
  getBinTotal: (binId: string, season?: number) => number;
  /** Operations for managing field definitions */
  addField: (field: Omit<Field, 'id'>, requestedId?: string) => Promise<boolean>;
  updateField: (field: Field) => Promise<boolean>;
  deleteField: (id: string) => Promise<boolean>;
  /** Operations for managing bin definitions */
  addBin: (bin: Omit<Bin, 'id'>) => Promise<boolean>;
  updateBin: (bin: Bin) => Promise<boolean>;
  deleteBin: (id: string) => Promise<boolean>;
  /** Operations for managing seed varieties */
  addSeed: (name: string) => Promise<boolean>;
  deleteSeed: (id: string) => Promise<boolean>;
  /** Operations for managing spray recipes */
  addSprayRecipe: (recipe: Omit<SprayRecipe, 'id'>) => Promise<boolean>;
  updateSprayRecipe: (recipe: SprayRecipe) => Promise<boolean>;
  deleteSprayRecipe: (id: string) => Promise<boolean>;
  /** Operations for managing fertilizer recipes */
  addFertilizerRecipe: (recipe: Omit<FertilizerRecipe, 'id' | 'farm_id'>) => Promise<boolean>;
  updateFertilizerRecipe: (recipe: FertilizerRecipe) => Promise<boolean>;
  deleteFertilizerRecipe: (id: string) => Promise<boolean>;
  /** Global sign out and cache clearing */
  signOut: () => void;
  /** Clears all local application storage */
  clearLocalCache: () => void;
  /** Unique ID for the current farm */
  farm_id: string | null;
  /** Display name of the current farm */
  farmName: string | null;
  /** Update display name of the current farm */
  updateFarmName: (name: string) => Promise<boolean>;
  /** Whether the user has completed the onboarding flow */
  onboardingComplete: boolean;
  /** Marks onboarding as complete on server & client */
  completeOnboarding: () => Promise<boolean>;
  /** Restores the entire farm state from a JSON backup */
  restoreFromBackup: (data: any) => Promise<boolean>;
  /** Refresh/refetch all farm data from Supabase */
  refresh: () => Promise<boolean>;
  /** Operations for managing FSA tract imports */
  importTract: (tractKey: string, filename: string, geojson: unknown, featureCount: number) => Promise<boolean>;
  deleteTract: (id: string) => Promise<boolean>;
  /** Operations for managing CLU-to-field assignments */
  assignClu: (fieldId: string, tractKey: string, cluNumber: string, acres: number, landUse?: CluLandUse) => Promise<boolean>;
  updateCluLandUse: (assignmentId: string, landUse: CluLandUse) => Promise<boolean>;
  unassignClu: (fieldId: string, tractKey: string, cluNumber: string) => Promise<boolean>;
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
    onboardingComplete, setOnboardingComplete,
  } = auth;

  const [farmName, setFarmName] = useState<string | null>(null);

  // --- Data State ---
  const [fields, setFields] = useState<Field[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [plantRecords, setPlantRecords] = useState<PlantRecord[]>([]);
  const [sprayRecords, setSprayRecords] = useState<SprayRecord[]>([]);
  const [harvestRecords, setHarvestRecords] = useState<HarvestRecord[]>([]);
  const [hayHarvestRecords, setHayHarvestRecords] = useState<HayHarvestRecord[]>([]);
  const [fertilizerApplications, setFertilizerApplications] = useState<FertilizerApplication[]>([]);
  const [tillageRecords, setTillageRecords] = useState<TillageRecord[]>([]);
  const [grainMovements, setGrainMovements] = useState<GrainMovement[]>([]);
  const [savedSeeds, setSavedSeeds] = useState<SavedSeed[]>([]);
  const [fertilizerRecipes, setFertilizerRecipes] = useState<FertilizerRecipe[]>([]);
  const [sprayRecipes, setSprayRecipes] = useState<SprayRecipe[]>([]);
  const [fsaTracts, setFsaTracts] = useState<FsaTractImport[]>([]);
  const [cluAssignments, setCluAssignments] = useState<FieldCluAssignment[]>([]);

  // --- Network & Offline State ---
  const { isOnline } = useNetworkStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  // True once the authoritative initial data load has settled for this session.
  // Online: set when fetchData resolves. Offline: set when cache hydration resolves.
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);
  // Mirror isOnline in a ref so effects that must NOT re-run on network changes
  // (e.g. cache hydration) can still read the latest status when they settle.
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  const updatePendingSyncCount = useCallback(async () => {
    if (farm_id) {
      const count = await syncQueue.getPendingCount(farm_id);
      setPendingSyncCount(count);
    } else {
      setPendingSyncCount(0);
    }
  }, [farm_id]);

  useEffect(() => {
    updatePendingSyncCount();
  }, [farm_id, updatePendingSyncCount]);

  // Hydrate local cache only after auth state is resolved.
  useEffect(() => {
    if (session === undefined) return;

    // Reset load-settled flag on session/user change so initial-load-sensitive
    // decisions (e.g. the onboarding gate) don't act on stale signals.
    setCacheHydrated(false);
    setInitialFetchComplete(false);
    const userId = session?.user?.id ?? null;
    const hydrateCache = async () => {
      try {
        const [
          fieldsData, binsData, plantData, sprayData, harvestData, hayData,
          fertilizerData, tillageData, grainData, seedsData, fertilizerRecipesData, recipesData,
          tractsData, assignmentsData
        ] = await Promise.all([
          offlineStorage.loadCache('fields', userId),
          offlineStorage.loadCache('bins', userId),
          offlineStorage.loadCache('plant_records', userId),
          offlineStorage.loadCache('spray_records', userId),
          offlineStorage.loadCache('harvest_records', userId),
          offlineStorage.loadCache('hay_harvest_records', userId),
          offlineStorage.loadCache('fertilizer_applications', userId),
          offlineStorage.loadCache('tillage_records', userId),
          offlineStorage.loadCache('grain_movements', userId),
          offlineStorage.loadCache('saved_seeds', userId),
          offlineStorage.loadCache('fertilizer_recipes', userId),
          offlineStorage.loadCache('spray_recipes', userId),
          offlineStorage.loadCache('fsa_tract_imports', userId),
          offlineStorage.loadCache('field_clu_assignments', userId),
        ]);

        if (fieldsData) setFields(fieldsData);
        if (binsData) setBins(binsData);
        if (plantData) setPlantRecords(plantData);
        if (sprayData) setSprayRecords(sprayData);
        if (harvestData) setHarvestRecords(harvestData);
        if (hayData) setHayHarvestRecords(hayData);
        if (fertilizerData) setFertilizerApplications(fertilizerData);
        if (tillageData) setTillageRecords(tillageData);
        if (grainData) setGrainMovements(grainData);
        if (seedsData) setSavedSeeds(seedsData);
        if (fertilizerRecipesData) setFertilizerRecipes(fertilizerRecipesData);
        if (recipesData) setSprayRecipes(recipesData);
        if (tractsData) setFsaTracts(tractsData);
        if (assignmentsData) {
          setCluAssignments(assignmentsData.map((assignment: FieldCluAssignment) => ({
            ...assignment,
            landUse: assignment.landUse ?? 'cropland',
          })));
        }
      } catch (err) {
        console.error('Failed to hydrate store from offline cache:', err);
      } finally {
        setCacheHydrated(true);
        // When offline, the local cache is the authoritative source — mark the
        // initial load settled. Online users wait for fetchData instead.
        if (!isOnlineRef.current) setInitialFetchComplete(true);
      }
    };
    hydrateCache();
    updatePendingSyncCount();
  }, [session?.user?.id, session, updatePendingSyncCount]);

  // --- Fetch data when farm_id is stable ---
  const fetchData = useCallback(async (): Promise<boolean> => {
    if (!session || !farm_id) return false;
    if (!isOnline) {
      // Offline with a valid farm: the local cache is authoritative, so the
      // initial load has settled. Mirrors the cache-hydration path and covers
      // the case where hydration ran while online before the network dropped.
      setInitialFetchComplete(true);
      return true;
    }
    setLoading(true);
    setFetchError(false);
    try {
      const query = (table: string) => supabase.from(table).select('*').eq('farm_id', farm_id).is('deleted_at', null);
      const orderedQuery = (table: string) => query(table).order('season_year', { ascending: false });

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
        { data: recipesData, error: recipesErr },
        { data: tractsData, error: tractsErr },
        { data: assignmentsData, error: assignmentsErr },
        { data: farmData, error: farmErr }
      ] = await Promise.all([
        query('fields'),
        query('bins'),
        orderedQuery('plant_records'),
        orderedQuery('spray_records'),
        orderedQuery('harvest_records'),
        orderedQuery('hay_harvest_records'),
        supabase.from('fertilizer_applications')
          .select('*, fields(name)')
          .eq('farm_id', farm_id)
          .is('deleted_at', null)
          .order('season_year', { ascending: false }),
        orderedQuery('tillage_records'),
        query('grain_movements'),
        query('saved_seeds'),
        query('fertilizer_recipes'),
        query('spray_recipes'),
        query('fsa_tract_imports'),
        query('field_clu_assignments'),
        supabase.from('farms').select('name').eq('id', farm_id).single()
      ]);

          const fetchErrors = [
            fieldsErr, binsErr, plantErr, sprayErr, harvestErr,
            hayErr, fertilizerErr, tillageErr, grainErr, seedsErr,
            fertilizerRecipesErr, recipesErr, tractsErr, assignmentsErr, farmErr
          ].filter(Boolean);

          if (fetchErrors.length > 0) {
            console.error('Data fetch errors:', fetchErrors);
            setFetchError(true);
            toast.error('Some data failed to load from cloud. Showing local cache.');
            return false;
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
          if (tractsData) setFsaTracts(tractsData.map(mapTractFromDb));
          if (assignmentsData) setCluAssignments(assignmentsData.map(mapAssignmentFromDb));
          
          if (farmData && farmData.name) {
            setFarmName(farmData.name);
          }

          return true;
        } catch (error) {
          console.error('Error fetching data:', error);
          setFetchError(true);
          return false;
        } finally {
          setLoading(false);
          setInitialFetchComplete(true);
        }
  }, [session, farm_id, isOnline, setLoading]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  });

  useEffect(() => {
    fetchData();
  }, [session?.user?.id, farm_id]);

  // --- Local storage persistence ---
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('fields', session.user.id, fields); } }, [fields, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('bins', session.user.id, bins); } }, [bins, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('plant_records', session.user.id, plantRecords); } }, [plantRecords, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('spray_records', session.user.id, sprayRecords); } }, [sprayRecords, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('harvest_records', session.user.id, harvestRecords); } }, [harvestRecords, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('hay_harvest_records', session.user.id, hayHarvestRecords); } }, [hayHarvestRecords, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('fertilizer_applications', session.user.id, fertilizerApplications); } }, [fertilizerApplications, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('tillage_records', session.user.id, tillageRecords); } }, [tillageRecords, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('grain_movements', session.user.id, grainMovements); } }, [grainMovements, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('saved_seeds', session.user.id, savedSeeds); } }, [savedSeeds, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('fertilizer_recipes', session.user.id, fertilizerRecipes); } }, [fertilizerRecipes, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('spray_recipes', session.user.id, sprayRecipes); } }, [sprayRecipes, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('fsa_tract_imports', session.user.id, fsaTracts); } }, [fsaTracts, session?.user?.id, cacheHydrated]);
  useEffect(() => { if (session?.user?.id && cacheHydrated) { offlineStorage.saveCache('field_clu_assignments', session.user.id, cluAssignments); } }, [cluAssignments, session?.user?.id, cacheHydrated]);
  useEffect(() => { saveToStorage('al_active_season', activeSeason, session?.user?.id); }, [activeSeason, session?.user?.id]);
  useEffect(() => { saveToStorage('al_viewing_season', viewingSeason, session?.user?.id); }, [viewingSeason, session?.user?.id]);
  useEffect(() => { saveToStorage('al_farm_id', farm_id, session?.user?.id); }, [farm_id, session?.user?.id]);

  // --- Reconnect Queue Replay ---
  useEffect(() => {
    if (isOnline && farm_id) {
      const runReplay = async () => {
        const success = await syncQueue.replayQueue(farm_id);
        if (success) {
          fetchDataRef.current();
        }
        updatePendingSyncCount();
      };
      runReplay();
    }
  }, [isOnline, farm_id, updatePendingSyncCount]);

  // --- Compose CRUD hooks ---
  const plantOps = usePlantRecords({ farm_id, viewingSeason, setPlantRecords, isOnline, onMutation: updatePendingSyncCount });
  const sprayOps = useSprayRecords({ farm_id, viewingSeason, setSprayRecords, isOnline, onMutation: updatePendingSyncCount });
  const harvestOps = useHarvestRecords({ farm_id, viewingSeason, setHarvestRecords, isOnline, onMutation: updatePendingSyncCount });
  const hayOps = useHayRecords({ farm_id, viewingSeason, setHayHarvestRecords, isOnline, onMutation: updatePendingSyncCount });
  const fertilizerOps = useFertilizerRecords({ farm_id, viewingSeason, fields, setFertilizerApplications, isOnline, onMutation: updatePendingSyncCount });
  const tillageOps = useTillageRecords({ farm_id, viewingSeason, setTillageRecords, isOnline, onMutation: updatePendingSyncCount });
  const grainOps = useGrainMovements({ farm_id, viewingSeason, setGrainMovements, isOnline, onMutation: updatePendingSyncCount });

  const entityOps = useFieldsAndBins({
    farm_id, setFields, setBins,
    setSavedSeeds,
    setFertilizerRecipes,
    setSprayRecipes,
    isOnline,
    onMutation: updatePendingSyncCount
  });

  const tractOps = useFsaTracts({
    farm_id, fsaTracts, cluAssignments, setFsaTracts, setCluAssignments,
    isOnline, onMutation: updatePendingSyncCount,
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
    refetchFarmData: fetchData,
    isOnline,
  });

  // --- Composed signOut (auth + cache clear) ---
  const signOut = useCallback(async () => {
    await auth.signOut();
    await seasonOps.clearLocalCache();
  }, [auth, seasonOps.clearLocalCache]);

  // --- Derived data ---
  const seasonOptions = useMemo(() => {
    const seasons = new Set<number>();
    seasons.add(activeSeason);
    seasons.add(activeSeason - 1);
    seasons.add(activeSeason - 2);

    plantRecords.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });
    sprayRecords.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });
    harvestRecords.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });
    hayHarvestRecords.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });
    fertilizerApplications.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });
    tillageRecords.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });
    grainMovements.forEach(r => { if (r.seasonYear) seasons.add(r.seasonYear); });

    return Array.from(seasons).sort((a, b) => b - a);
  }, [
    activeSeason,
    plantRecords,
    sprayRecords,
    harvestRecords,
    hayHarvestRecords,
    fertilizerApplications,
    tillageRecords,
    grainMovements,
  ]);

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

  const binTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    grainMovements.filter(m => !m.deleted_at).forEach(m => {
      const sKey = `${m.binId}-${m.seasonYear}`;
      totals[sKey] = (totals[sKey] || 0) + (m.type === 'in' ? m.bushels : -m.bushels);

      const aKey = `${m.binId}-all`;
      totals[aKey] = (totals[aKey] || 0) + (m.type === 'in' ? m.bushels : -m.bushels);
    });
    return totals;
  }, [grainMovements]);

  const getBinTotal = useCallback((binId: string, season?: number) => {
    const key = season ? `${binId}-${season}` : `${binId}-all`;
    return binTotals[key] || 0;
  }, [binTotals]);

  const updateFarmName = useCallback(async (newName: string): Promise<boolean> => {
    if (!farm_id) {
      toast.error('No farm selected.');
      return false;
    }
    if (!newName.trim()) {
      toast.error('Farm name cannot be empty.');
      return false;
    }

    try {
      const { error } = await supabase.rpc('update_farm_name', { p_name: newName.trim() });
      if (error) throw error;

      setFarmName(newName.trim());
      toast.success('Farm name updated successfully.');
      return true;
    } catch (err: any) {
      console.error('Error updating farm name:', err);
      toast.error(err.message || 'Failed to update farm name.');
      return false;
    }
  }, [farm_id]);

  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    const userId = session?.user?.id;
    if (!userId) {
      toast.error('Authentication required.');
      return false;
    }

    try {
      localStorage.setItem(`${userId}_al_onboarding_complete`, '1');
      setOnboardingComplete(true);

      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', userId);
      if (error) throw error;

      return true;
    } catch (err: any) {
      console.error('Error completing onboarding:', err);
      toast.error(err.message || 'Failed to save onboarding progress. Please try again.');
      return false;
    }
  }, [session, setOnboardingComplete]);

  return (
    <FarmContext.Provider value={{
      session, isOnline, pendingSyncCount, loading, initialFetchComplete, fetchError,
      fields: sortedFields,
      bins: filteredBins,
      plantRecords, sprayRecords, harvestRecords, hayHarvestRecords,
      fertilizerApplications,
      tillageRecords,
      grainMovements,
      savedSeeds,
      fertilizerRecipes,
      sprayRecipes,
      fsaTracts,
      cluAssignments,
      activeSeason, viewingSeason, seasonOptions, setViewingSeason,
      rolloverToNewSeason: seasonOps.rolloverToNewSeason,
      ...plantOps,
      ...sprayOps,
      ...harvestOps,
      ...hayOps,
      ...fertilizerOps,
      ...tillageOps,
      ...grainOps,
      getBinTotal,
      ...entityOps,
      signOut,
      clearLocalCache: seasonOps.clearLocalCache,
      farm_id,
      farmName,
      updateFarmName,
      onboardingComplete,
      completeOnboarding,
      restoreFromBackup: seasonOps.restoreFromBackup,
      refresh: fetchData,
      importTract: tractOps.importTract,
      deleteTract: tractOps.deleteTract,
      assignClu: tractOps.assignClu,
      updateCluLandUse: tractOps.updateCluLandUse,
      unassignClu: tractOps.unassignClu,
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
