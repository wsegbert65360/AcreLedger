import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import { Field, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, Bin, GrainMovement, SavedSeed, SprayRecipe, FertilizerApplication } from '@/types/farm';
import { supabase } from '@/lib/supabase';
import {
  mapFieldFromDb, mapBinFromDb, mapPlantFromDb, mapSprayFromDb,
  mapHarvestFromDb, mapHayFromDb, mapGrainFromDb, mapSeedFromDb, mapRecipeFromDb,
  mapFieldToDb, mapBinToDb, mapPlantToDb, mapSprayToDb,
  mapHarvestToDb, mapHayToDb, mapGrainToDb, mapSeedToDb, mapRecipeToDb,
  mapFertilizerFromDb, mapFertilizerToDb
} from '../lib/mappers';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { fieldService } from '@/services/fieldService';
import { binService } from '@/services/binService';

const DEFAULT_FIELDS: Field[] = [];

const DEFAULT_BINS: Bin[] = [];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error loading from storage (${key}):`, error);
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to storage:`, error);
  }
}

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
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [fields, setFields] = useState<Field[]>(() => loadFromStorage('al_fields', DEFAULT_FIELDS));
  const [bins, setBins] = useState<Bin[]>(() => loadFromStorage('al_bins', DEFAULT_BINS));
  const [plantRecords, setPlantRecords] = useState<PlantRecord[]>(() => loadFromStorage('al_plant', []));
  const [sprayRecords, setSprayRecords] = useState<SprayRecord[]>(() => loadFromStorage('al_spray', []));
  const [harvestRecords, setHarvestRecords] = useState<HarvestRecord[]>(() => loadFromStorage('al_harvest', []));
  const [hayHarvestRecords, setHayHarvestRecords] = useState<HayHarvestRecord[]>(() => loadFromStorage('al_hay', []));
  const [fertilizerApplications, setFertilizerApplications] = useState<FertilizerApplication[]>(() => loadFromStorage('al_fertilizer', []));
  const [grainMovements, setGrainMovements] = useState<GrainMovement[]>(() => loadFromStorage('al_grain', []));
  const [savedSeeds, setSavedSeeds] = useState<SavedSeed[]>(() => loadFromStorage('al_seeds', []));
  const [sprayRecipes, setSprayRecipes] = useState<SprayRecipe[]>(() => loadFromStorage('al_recipes', []));
  const [activeSeason, setActiveSeason] = useState<number>(() => loadFromStorage('al_active_season', new Date().getFullYear()));
  const [viewingSeason, setViewingSeason] = useState<number>(() => loadFromStorage('al_active_season', new Date().getFullYear()));
  const [farm_id, setFarmId] = useState<string | null>(() => loadFromStorage('al_farm_id', null));

  // Initialize Supabase session & handle Auth Changes
  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);

        if (initialSession?.user) {
          const jwtFarmId = initialSession.user.app_metadata?.farm_id || initialSession.user.user_metadata?.farm_id;
          if (jwtFarmId) setFarmId(jwtFarmId);
        }
      } catch (err) {
        console.error('Session initialization failed:', err);
        toast.error('Could not connect to authentication service. Check your connection.');
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Auth state changed

      setSession(newSession);
      if (newSession?.user) {
        const jwtFarmId = newSession.user.app_metadata?.farm_id || newSession.user.user_metadata?.farm_id;
        if (jwtFarmId) setFarmId(jwtFarmId);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync farm_id from Profile to JWT (One-way stabilization)
  useEffect(() => {
    if (!session || !session.user) return;

    const syncAuth = async () => {
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('farm_id, active_season')
          .single();

        if (profileData) {
          let currentFarmId = profileData.farm_id;

          // Auto-create farm if missing
          if (!currentFarmId) {
            // No farm found

            const { data: nf } = await supabase.from('farms').insert([{ name: 'My Farm' }]).select().single();
            if (nf) {
              currentFarmId = nf.id;
              const { error: updateError } = await supabase.from('profiles').update({ farm_id: currentFarmId }).eq('id', session.user.id);
              if (updateError) {
                console.error('Error updating profile with farm_id:', updateError);
                toast.error('Failed to link farm to profile');
              }
            }
          }

          if (currentFarmId) {
            setFarmId(currentFarmId);
            // ONLY refresh if the JWT is actually missing the ID
            const jwtId = session.user.app_metadata?.farm_id || session.user.user_metadata?.farm_id;
            if (currentFarmId !== jwtId) {
              await supabase.auth.refreshSession();
            }
            if (profileData.active_season) {
              setActiveSeason(profileData.active_season);
              setViewingSeason(profileData.active_season);
            }
          }
        }
      } catch (err) {
        console.error('Sync error:', err);
      }
    };

    syncAuth();
  }, [session?.user?.id]); // Only runs when user changes

  // Fetch data only when farm_id is stable
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
  }, [session?.user?.id, farm_id]);

  // Note: Local storage persistence is maintained for offline resilience, 
  // but cloud sync is now handled individually by each CRUD operation.
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

  const uid = () => crypto.randomUUID();

  const addPlantRecord = useCallback(async (r: Omit<PlantRecord, 'id' | 'timestamp'>) => {
    const id = uid();
    const timestamp = Date.now();
    const newRecord: PlantRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    // Optimistic update
    setPlantRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('plant_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      seed_variety: r.seedVariety,
      acreage: r.acreage,
      crop: r.crop,
      plant_date: r.plantDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      fsa_field_number: r.fsaFieldNumber,
      intended_use: r.intendedUse,
      producer_share: r.producerShare,
      irrigation_practice: r.irrigationPractice,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
    }]);

    if (error) {
      console.error('Error adding plant record:', error);
      setPlantRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save planting record');
    } else {
      toast.success('Planting record saved!');
    }
  }, [activeSeason, farm_id]);

  const updatePlantRecord = useCallback(async (r: PlantRecord) => {
    const previous = plantRecords.find(item => item.id === r.id);
    setPlantRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('plant_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      seed_variety: r.seedVariety,
      acreage: r.acreage,
      crop: r.crop,
      plant_date: r.plantDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      fsa_field_number: r.fsaFieldNumber,
      intended_use: r.intendedUse,
      producer_share: r.producerShare,
      irrigation_practice: r.irrigationPractice,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
    });

    if (error) {
      console.error('Error updating plant record:', error);
      if (previous) setPlantRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update record');
    } else {
      toast.success('Record updated');
    }

  }, [farm_id]);

  const addSprayRecord = useCallback(async (r: Omit<SprayRecord, 'id' | 'timestamp'>) => {
    const id = uid();
    const timestamp = Date.now();
    const newRecord: SprayRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setSprayRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('spray_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      product: r.product,
      products: r.products,
      wind_speed: r.windSpeed,
      temperature: r.temperature,
      spray_date: r.sprayDate,
      start_time: r.startTime,
      equipment_id: r.equipmentId,
      applicator_name: r.applicatorName,
      license_number: r.licenseNumber,
      epa_reg_number: r.epaRegNumber,
      target_pest: r.targetPest,
      wind_direction: r.windDirection,
      relative_humidity: r.relativeHumidity,
      treated_area_size: r.treatedAreaSize,
      total_amount_applied: r.totalAmountApplied,
      involved_technicians: r.involvedTechnicians,
      mixture_rate: r.mixtureRate,
      total_mixture_volume: r.totalMixtureVolume,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
    }]);

    if (error) {
      console.error('Error adding spray record:', error);
      setSprayRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save spray record');
    } else {
      toast.success('Spray application recorded!');
    }
  }, [activeSeason, farm_id]);

  const updateSprayRecord = useCallback(async (r: SprayRecord) => {
    const previous = sprayRecords.find(item => item.id === r.id);
    setSprayRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('spray_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      product: r.product,
      products: r.products,
      wind_speed: r.windSpeed,
      temperature: r.temperature,
      spray_date: r.sprayDate,
      start_time: r.startTime,
      equipment_id: r.equipmentId,
      applicator_name: r.applicatorName,
      license_number: r.licenseNumber,
      epa_reg_number: r.epaRegNumber,
      target_pest: r.targetPest,
      wind_direction: r.windDirection,
      relative_humidity: r.relativeHumidity,
      treated_area_size: r.treatedAreaSize,
      total_amount_applied: r.totalAmountApplied,
      involved_technicians: r.involvedTechnicians,
      mixture_rate: r.mixtureRate,
      total_mixture_volume: r.totalMixtureVolume,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
    });

    if (error) {
      console.error('Error updating spray record:', error);
      if (previous) setSprayRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update spray record');
    } else {
      toast.success('Spray record updated');
    }

  }, [farm_id]);

  const addHarvestRecord = useCallback(async (r: Omit<HarvestRecord, 'id' | 'timestamp'>) => {
    const id = uid();
    const timestamp = Date.now();
    const newRecord: HarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setHarvestRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('harvest_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      crop: r.crop,
      destination: r.destination,
      bin_id: r.binId,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      landlord_split_percent: r.landlordSplitPercent,
      harvest_date: r.harvestDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
    }]);

    if (error) {
      console.error('Error adding harvest record:', error);
      setHarvestRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save harvest');
    } else {
      toast.success('Harvest recorded!');
    }
  }, [activeSeason, farm_id]);

  const updateHarvestRecord = useCallback(async (r: HarvestRecord) => {
    const previous = harvestRecords.find(item => item.id === r.id);
    setHarvestRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('harvest_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      crop: r.crop,
      destination: r.destination,
      bin_id: r.binId,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      landlord_split_percent: r.landlordSplitPercent,
      harvest_date: r.harvestDate,
      fsa_farm_number: r.fsaFarmNumber,
      fsa_tract_number: r.fsaTractNumber,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
    });

    if (error) {
      console.error('Error updating harvest record:', error);
      if (previous) setHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update harvest');
    } else {
      toast.success('Harvest updated');
    }

  }, [farm_id]);

  const addHayHarvestRecord = useCallback(async (r: Omit<HayHarvestRecord, 'id' | 'timestamp'>) => {
    const id = uid();
    const timestamp = Date.now();
    const newRecord: HayHarvestRecord = { ...r, id, timestamp, seasonYear: activeSeason };

    setHayHarvestRecords(prev => [...prev, newRecord]);

    const { error } = await supabase.from('hay_harvest_records').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      date: r.date,
      bale_count: r.baleCount,
      cutting_number: r.cuttingNumber,
      bale_type: r.baleType,
      temperature: r.temperature,
      conditions: r.conditions,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
    }]);

    if (error) {
      console.error('Error adding hay harvest record:', error);
      setHayHarvestRecords(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save hay record');
    } else {
      toast.success('Hay harvest recorded!');
    }
  }, [activeSeason, farm_id]);

  const updateHayHarvestRecord = useCallback(async (r: HayHarvestRecord) => {
    const previous = hayHarvestRecords.find(item => item.id === r.id);
    setHayHarvestRecords(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('hay_harvest_records').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      field_name: r.fieldName,
      date: r.date,
      bale_count: r.baleCount,
      cutting_number: r.cuttingNumber,
      bale_type: r.baleType,
      temperature: r.temperature,
      conditions: r.conditions,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
    });

    if (error) {
      console.error('Error updating hay harvest record:', error);
      if (previous) setHayHarvestRecords(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update hay record');
    } else {
      toast.success('Hay record updated');
    }

  }, [farm_id]);

  const addGrainMovement = useCallback(async (r: Omit<GrainMovement, 'id'> & { timestamp?: number }) => {
    const id = uid();
    const timestamp = r.timestamp || Date.now();
    const newRecord: GrainMovement = { ...r, id, timestamp, seasonYear: activeSeason };

    setGrainMovements(prev => [...prev, newRecord]);

    const { error } = await supabase.from('grain_movements').insert([{
      id,
      farm_id,
      bin_id: r.binId,
      bin_name: r.binName,
      type: r.type,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      source_field_name: r.sourceFieldName,
      destination: r.destination,
      price: r.price,
      season_year: activeSeason,
      timestamp: new Date(timestamp).toISOString()
    }]);

    if (error) {
      console.error('Error adding grain movement:', error);
      setGrainMovements(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to record movement');
    } else {
      toast.success('Grain movement recorded!');
    }
  }, [activeSeason, farm_id]);

  const updateGrainMovement = useCallback(async (r: GrainMovement) => {
    const previous = grainMovements.find(item => item.id === r.id);
    setGrainMovements(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('grain_movements').upsert({
      id: r.id,
      farm_id,
      bin_id: r.binId,
      bin_name: r.binName,
      type: r.type,
      bushels: r.bushels,
      moisture_percent: r.moisturePercent,
      source_field_name: r.sourceFieldName,
      destination: r.destination,
      price: r.price,
      season_year: r.seasonYear,
      timestamp: new Date(r.timestamp).toISOString()
    });

    if (error) {
      console.error('Error updating grain movement:', error);
      if (previous) setGrainMovements(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update grain movement');
    } else {
      toast.success('Grain movement updated');
    }

  }, [farm_id]);

  const deleteGrainMovements = useCallback(async (ids: string[]) => {
    const previous = grainMovements.filter(r => ids.includes(r.id));
    setGrainMovements(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('grain_movements')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting grain movements:', error);
      setGrainMovements(prev => [...prev, ...previous]);
      toast.error('Delete failed');
    } else {
      toast.success('Records removed');
    }

  }, [farm_id]);

  const deletePlantRecords = useCallback(async (ids: string[]) => {
    const previous = plantRecords.filter(r => ids.includes(r.id));
    setPlantRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('plant_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting plant records:', error);
      setPlantRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }

  }, [farm_id]);

  const deleteSprayRecords = useCallback(async (ids: string[]) => {
    const previous = sprayRecords.filter(r => ids.includes(r.id));
    setSprayRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('spray_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting spray records:', error);
      setSprayRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }

  }, [farm_id]);

  const deleteHarvestRecords = useCallback(async (ids: string[]) => {
    const previous = harvestRecords.filter(r => ids.includes(r.id));
    setHarvestRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting harvest records:', error);
      setHarvestRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }

  }, [farm_id]);

  const deleteHayHarvestRecords = useCallback(async (ids: string[]) => {
    const previous = hayHarvestRecords.filter(r => ids.includes(r.id));
    setHayHarvestRecords(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('hay_harvest_records')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting hay harvest records:', error);
      setHayHarvestRecords(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }

  }, [farm_id]);

  const addFertilizerApplication = useCallback(async (r: Omit<FertilizerApplication, 'id' | 'created_at' | 'updated_at' | 'fieldName'>) => {
    const id = uid();
    const now = new Date().toISOString();
    const newRecord: FertilizerApplication = {
      ...r,
      id,
      created_at: now,
      updated_at: now,
      fieldName: fields.find(f => f.id === r.fieldId)?.name || 'Unknown Field'
    };

    setFertilizerApplications(prev => [...prev, newRecord]);

    const { error } = await supabase.from('fertilizer_applications').insert([{
      id,
      farm_id,
      field_id: r.fieldId,
      date: r.date,
      acres: r.acres,
      fertilizer_formula: r.fertilizer_formula,
      season_year: r.season_year || activeSeason
    }]);

    if (error) {
      console.error('Error adding fertilizer application:', error);
      setFertilizerApplications(prev => prev.filter(rec => rec.id !== id));
      toast.error(`Failed to save: ${error.message}`);
    } else {
      toast.success('Fertilizer application recorded!');
    }
  }, [activeSeason, farm_id, fields]);

  const updateFertilizerApplication = useCallback(async (r: FertilizerApplication) => {
    const previous = fertilizerApplications.find(item => item.id === r.id);
    setFertilizerApplications(prev => prev.map(existing => existing.id === r.id ? r : existing));

    const { error } = await supabase.from('fertilizer_applications').upsert({
      id: r.id,
      farm_id,
      field_id: r.fieldId,
      date: r.date,
      acres: r.acres,
      fertilizer_formula: r.fertilizer_formula,
      season_year: r.season_year,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Error updating fertilizer application:', error);
      if (previous) setFertilizerApplications(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update record');
    } else {
      toast.success('Record updated');
    }
  }, [farm_id]);

  const deleteFertilizerApplications = useCallback(async (ids: string[]) => {
    const previous = fertilizerApplications.filter(r => ids.includes(r.id));
    setFertilizerApplications(prev => prev.filter(r => !ids.includes(r.id)));
    const { error } = await supabase
      .from('fertilizer_applications')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting fertilizer applications:', error);
      setFertilizerApplications(prev => [...prev, ...previous]);
      toast.error('Failed to delete records');
    } else {
      toast.success('Records deleted');
    }
  }, [farm_id]);

  const getBinTotal = useCallback((binId: string, season?: number) => {
    return grainMovements
      .filter(m => m.binId === binId && (!season || m.seasonYear === season))
      .reduce((total, m) => total + (m.type === 'in' ? m.bushels : -m.bushels), 0);
  }, [grainMovements]);

  const addField = useCallback(async (f: Omit<Field, 'id'>) => {
    const id = uid();
    setFields(prev => [...prev, { ...f, id }]);

    const { error } = await fieldService.createField(f, id, farm_id!);

    if (error) {
      console.error('Supabase error adding field:', error);
      setFields(prev => prev.filter(f => f.id !== id));
      toast.error('Failed to save field');
    } else {
      toast.success('Field created!');
    }
  }, [farm_id]);

  const updateField = useCallback(async (f: Field) => {
    const previous = fields.find(item => item.id === f.id);
    setFields(prev => prev.map(existing => existing.id === f.id ? f : existing));

    const { error } = await fieldService.updateField(f, farm_id!);

    if (error) {
      console.error('Supabase error updating field:', error);
      if (previous) setFields(prev => prev.map(item => item.id === f.id ? previous : item));
      toast.error('Failed to update field');
    } else {
      toast.success('Field updated');
    }
  }, [farm_id]);

  const deleteField = useCallback(async (id: string) => {
    const previous = fields.find(f => f.id === id);
    setFields(prev => prev.map(f =>
      f.id === id ? { ...f, deleted_at: new Date().toISOString() } : f
    ));
    const { error } = await fieldService.softDeleteField(id, farm_id!);
    if (error) {
      console.error('Error deleting field:', error);
      if (previous) setFields(prev => prev.map(f => f.id === id ? previous : f));
      toast.error('Failed to delete field');
    } else {
      toast.success('Field deleted');
    }

  }, [farm_id]);

  const addBin = useCallback(async (b: Omit<Bin, 'id'>) => {
    const id = uid();
    setBins(prev => [...prev, { ...b, id }]);
    const { error } = await binService.createBin(b, id, farm_id!);
    if (error) {
      console.error('Error adding bin:', error);
      setBins(prev => prev.filter(bin => bin.id !== id));
      toast.error('Failed to save bin');
    } else {
      toast.success('Bin created!');
    }

  }, [farm_id]);

  const updateBin = useCallback(async (b: Bin) => {
    const previous = bins.find(item => item.id === b.id);
    setBins(prev => prev.map(existing => existing.id === b.id ? b : existing));
    const { error } = await binService.updateBin(b, farm_id!);
    if (error) {
      console.error('Error updating bin:', error);
      if (previous) setBins(prev => prev.map(item => item.id === b.id ? previous : item));
      toast.error('Failed to update bin');
    } else {
      toast.success('Bin updated');
    }

  }, [farm_id]);

  const deleteBin = useCallback(async (id: string) => {
    const previous = bins.find(b => b.id === id);
    setBins(prev => prev.map(b =>
      b.id === id ? { ...b, deleted_at: new Date().toISOString() } : b
    ));
    const { error } = await binService.softDeleteBin(id, farm_id!);
    if (error) {
      console.error('Error deleting bin:', error);
      if (previous) setBins(prev => prev.map(b => b.id === id ? previous : b));
      toast.error('Failed to delete bin');
    } else {
      toast.success('Bin deleted');
    }

  }, [farm_id]);

  const addSeed = useCallback(async (name: string) => {
    const id = uid();
    setSavedSeeds(prev => [...prev, { id, name }]);
    const { error } = await supabase.from('saved_seeds').insert([{ id, farm_id, name }]);
    if (error) {
      console.error('Error adding seed:', error);
      setSavedSeeds(prev => prev.filter(s => s.id !== id));
      toast.error('Failed to save seed');
    } else {
      toast.success('Seed variety added!');
    }

  }, [farm_id]);

  const deleteSeed = useCallback(async (id: string) => {
    const previous = savedSeeds.find(s => s.id === id);
    setSavedSeeds(prev => prev.filter(s => s.id !== id));
    const { error } = await supabase
      .from('saved_seeds')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting seed:', error);
      if (previous) setSavedSeeds(prev => [...prev, previous]);
      toast.error('Failed to delete seed');
    } else {
      toast.success('Seed variety removed');
    }

  }, [farm_id]);

  const addSprayRecipe = useCallback(async (r: Omit<SprayRecipe, 'id'>) => {
    const id = uid();
    setSprayRecipes(prev => [...prev, { ...r, id }]);
    const { error } = await supabase.from('spray_recipes').insert([{
      id,
      farm_id,
      name: r.name,
      products: r.products,
      applicator_name: r.applicatorName,
      license_number: r.licenseNumber,
      target_pest: r.targetPest,
      epa_reg_number: r.epaRegNumber
    }]);
    if (error) {
      console.error('Error adding spray recipe:', error);
      setSprayRecipes(prev => prev.filter(rec => rec.id !== id));
      toast.error('Failed to save recipe');
    } else {
      toast.success('Spray recipe created!');
    }

  }, [farm_id]);

  const updateSprayRecipe = useCallback(async (r: SprayRecipe) => {
    const previous = sprayRecipes.find(item => item.id === r.id);
    setSprayRecipes(prev => prev.map(existing => existing.id === r.id ? r : existing));
    const { error } = await supabase.from('spray_recipes').upsert({
      id: r.id,
      farm_id,
      name: r.name,
      products: r.products,
      applicator_name: r.applicatorName,
      license_number: r.licenseNumber,
      target_pest: r.targetPest,
      epa_reg_number: r.epaRegNumber,
      deleted_at: r.deleted_at
    });
    if (error) {
      console.error('Error updating spray recipe:', error);
      if (previous) setSprayRecipes(prev => prev.map(item => item.id === r.id ? previous : item));
      toast.error('Failed to update recipe');
    } else {
      toast.success('Recipe updated');
    }

  }, [farm_id]);

  const deleteSprayRecipe = useCallback(async (id: string) => {
    const previous = sprayRecipes.find(r => r.id === id);
    setSprayRecipes(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase
      .from('spray_recipes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('farm_id', farm_id);
    if (error) {
      console.error('Error deleting spray recipe:', error);
      if (previous) setSprayRecipes(prev => [...prev, previous]);
      toast.error('Failed to delete recipe');
    } else {
      toast.success('Recipe removed');
    }

  }, [farm_id]);

  const rolloverToNewSeason = useCallback(async (year: number) => {
    // 1. Force Backup (JSON export)
    const backupData = {
      fields, bins, plantRecords, sprayRecords, harvestRecords, hayHarvestRecords, fertilizerApplications, grainMovements, savedSeeds, sprayRecipes, activeSeason,
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
  }, [fields, bins, plantRecords, sprayRecords, harvestRecords, hayHarvestRecords, fertilizerApplications, grainMovements, savedSeeds, sprayRecipes, activeSeason, session]);

  const restoreFromBackup = useCallback(async (backupData: any) => {
    if (!farm_id) {
      console.error('Cannot restore: No farm_id found');
      return;
    }

    setLoading(true);
    try {
      // Restore from backup


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

      // 3. Update local state — always map through schema normalization
      if (backupData.fields)
        setFields(backupData.fields);
      if (backupData.bins)
        setBins(backupData.bins);
      if (backupData.plantRecords)
        setPlantRecords(backupData.plantRecords);
      if (backupData.sprayRecords)
        setSprayRecords(backupData.sprayRecords);
      if (backupData.harvestRecords)
        setHarvestRecords(backupData.harvestRecords);
      if (backupData.hayHarvestRecords)
        setHayHarvestRecords(backupData.hayHarvestRecords);
      if (backupData.fertilizerApplications)
        setFertilizerApplications(backupData.fertilizerApplications);
      if (backupData.grainMovements)
        setGrainMovements(backupData.grainMovements);
      if (backupData.savedSeeds)
        setSavedSeeds(backupData.savedSeeds);
      if (backupData.sprayRecipes)
        setSprayRecipes(backupData.sprayRecipes);
      if (backupData.activeSeason) {
        setActiveSeason(backupData.activeSeason);
        setViewingSeason(backupData.activeSeason);
      }

    } catch (err) {
      console.error('Restore failed:', err);
      // alert('Restore failed. Please check console.');
    } finally {
      setLoading(false);
    }
  }, [farm_id]);

  const clearLocalCache = useCallback(() => {
    // Clear all keys starting with al_
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('al_')) {
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
    toast.success('Local cache cleared');
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearLocalCache();
  }, [clearLocalCache]);

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
      activeSeason, viewingSeason, setViewingSeason, rolloverToNewSeason,
      addPlantRecord, updatePlantRecord, addSprayRecord, updateSprayRecord,
      addHarvestRecord, updateHarvestRecord,
      addHayHarvestRecord, updateHayHarvestRecord,
      addFertilizerApplication, updateFertilizerApplication,
      addGrainMovement, updateGrainMovement,
      deleteGrainMovements,
      deletePlantRecords, deleteSprayRecords, deleteHarvestRecords, deleteHayHarvestRecords,
      deleteFertilizerApplications,
      getBinTotal,
      addField, updateField, deleteField,
      addBin, updateBin, deleteBin,
      addSeed, deleteSeed, addSprayRecipe, updateSprayRecipe, deleteSprayRecipe,
      signOut,
      clearLocalCache,
      farm_id,
      restoreFromBackup,
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

