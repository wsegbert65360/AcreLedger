import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import { Field, PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, CustomSprayRecord, Bin, GrainMovement, SavedSeed, SprayRecipe, FertilizerApplication, FertilizerRecipe, TillageRecord, WorkRequest } from '@/types/farm';
import { CluLandUse, FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';
import type { CattleEvent, CattleGroup, CattleGroupEdit, CattleMove } from '@/types/cattle';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { mapFieldFromDb, mapBinFromDb, mapPlantFromDb, mapSprayFromDb,
  mapHarvestFromDb, mapHayFromDb, mapCustomSprayFromDb, mapGrainFromDb, mapSeedFromDb, mapRecipeFromDb,
  mapFertilizerFromDb, mapFertilizerRecipeFromDb, mapTillageFromDb,
  mapFsaTractFromDb, mapFieldCluAssignmentFromDb, mapWorkRequestFromDb,
  mapEquipmentFromDb, mapMaintenanceScheduleFromDb, mapMaintenanceLogFromDb,
  mapCattleEventFromDb, mapCattleGroupFromDb, mapCattleMoveFromDb, mapCountyAssignmentFromDb
} from '../lib/mappers';
import type { CountyAssignment } from '@/lib/county/types';
// Database row types are handled via mappers
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import type { SignOutResult, SignOutScope } from '@/lib/authSignOut';
import { buildSeasonOptions, getMaxViewingSeason, isValidViewingSeason } from '@/lib/seasonYears';

import { getSignedBushels, roundTo } from '@/utils/numbers';
import { saveToStorage } from './storageUtils';
import { useAuth } from './useAuth';
import { usePlantRecords } from './usePlantRecords';
import { useSprayRecords } from './useSprayRecords';
import { useHarvestRecords } from './useHarvestRecords';
import { useHayRecords } from './useHayRecords';
import { useCustomSprayRecords } from './useCustomSprayRecords';
import { useFertilizerRecords } from './useFertilizerRecords';
import { useGrainMovements } from './useGrainMovements';
import { useFieldsAndBins } from './useFieldsAndBins';
import { useSeasonManagement, type ClearLocalCacheOptions } from './useSeasonManagement';
import { useTillageRecords } from './useTillageRecords';
import { useWorkRequests } from './useWorkRequests';
import { useEquipment } from './useEquipment';
import { useCattle, type CattleSaveOptions } from './useCattle';
import { useFsaTracts } from './useFsaTracts';
import { useCountyAssignments } from './useCountyAssignments';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { isOfflineDatabaseUnavailableError, offlineStorage } from '../lib/offlineStorage';
import { applyParkedEquipmentMutations } from '@/lib/equipment/parked';
import { applyParkedCattleMutations, queuedRunsCattle } from '@/lib/cattle/parked';
import { CATTLE_RPC_KEY, syncQueue, WebSyncQueueUnreadableError, type QueuedMutation } from '../lib/syncQueue';
import { isUnknownMutationOutcome } from '@/lib/mutationOutcome';
import { overlayQueuedRows } from '@/lib/queuedSnapshot';

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
  /** Queued changes that exhausted their retries and need export or discard. */
  failedSyncCount: number;
  /** Fail-closed until the offline queue can be read. Sign-out and deletion blocking keep using this. */
  syncQueueLocked: boolean;
  /** True only after a queue read failed. Stays false while the first read is still pending. */
  syncQueueReadFailed: boolean;
  lastSync: Date | null;
  retryFailedSyncChanges: () => Promise<void>;
  getFailedSyncChanges: () => Promise<unknown[]>;
  discardFailedSyncChanges: () => Promise<number>;
  /** Global loading state for data fetching */
  loading: boolean;
  /** True once the initial data load has settled for the current session (online fetch when online, cache hydration when offline). Gates decisions that must not race with the transient empty-fields render. */
  initialFetchComplete: boolean;
  /** Global error state for data fetching */
  fetchError: boolean;
  /** True when equipment/maintenance queries failed and cached equipment was kept. */
  equipmentLoadFailed: boolean;
  /** True when one or more enabled cattle queries failed and cached cattle was kept. */
  cattleLoadFailed: boolean;
  /** Whether the records currently shown came from the last successful cloud fetch or local cache. */
  dataLoadSource: 'cloud' | 'cache';
  /** ISO timestamp of the last cache hydrate or cloud fetch that populated records. */
  dataLoadedAt: string | null;
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
  /** Custom (outside-party) spray records */
  customSprayRecords: CustomSprayRecord[];
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
  /** Saved physical county assignments for fields and CLUs (derived; manual corrections persist). */
  countyAssignments: CountyAssignment[];
  /** Outbound work requests (status-driven, not season-scoped) */
  workRequests: WorkRequest[];
  /** Farm equipment and its recurring maintenance/service history. */
  equipment: Equipment[];
  maintenanceSchedules: MaintenanceSchedule[];
  maintenanceLogs: MaintenanceLog[];
  /** Farm-level feature setting. Defaults false until cache/cloud metadata loads. */
  runsCattle: boolean;
  cattleGroups: CattleGroup[];
  cattleMoves: CattleMove[];
  cattleEvents: CattleEvent[];
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
  /** Undo the latest server pre-season snapshot. Free farms can use this path. */
  undoPreSeasonReset: () => Promise<boolean>;
  /** Operations for managing planting records */
  addPlantRecord: (r: Omit<PlantRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updatePlantRecord: (r: PlantRecord) => Promise<boolean>;
  deletePlantRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing spray application records */
  addSprayRecord: (r: Omit<SprayRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updateSprayRecord: (r: SprayRecord) => Promise<boolean>;
  deleteSprayRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing harvest production records */
  addHarvestRecord: (r: Omit<HarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { id?: string; timestamp?: number }) => Promise<boolean>;
  addHarvestWithGrain: (input: {
    harvest: Omit<HarvestRecord, 'deleted_at' | 'seasonYear' | 'farm_id'>;
    grainMovement: Omit<GrainMovement, 'deleted_at' | 'seasonYear' | 'farm_id' | 'version'>;
  }) => Promise<boolean>;
  updateHarvestRecord: (r: HarvestRecord) => Promise<boolean>;
  deleteHarvestRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing hay harvest records */
  addHayHarvestRecord: (r: Omit<HayHarvestRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updateHayHarvestRecord: (r: HayHarvestRecord) => Promise<boolean>;
  deleteHayHarvestRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing custom (outside-party) spray records */
  addCustomSprayRecord: (r: Omit<CustomSprayRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updateCustomSprayRecord: (r: CustomSprayRecord) => Promise<boolean>;
  deleteCustomSprayRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing fertilizer applications */
  addFertilizerApplication: (r: Omit<FertilizerApplication, 'id' | 'timestamp' | 'created_at' | 'updated_at' | 'fieldName' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updateFertilizerApplication: (r: FertilizerApplication) => Promise<boolean>;
  deleteFertilizerApplications: (ids: string[]) => Promise<boolean>;
  /** Operations for managing tillage records */
  addTillageRecord: (r: Omit<TillageRecord, 'id' | 'timestamp' | 'deleted_at' | 'seasonYear' | 'farm_id'>) => Promise<boolean>;
  updateTillageRecord: (r: TillageRecord) => Promise<boolean>;
  deleteTillageRecords: (ids: string[]) => Promise<boolean>;
  /** Operations for managing grain inventory */
  addGrainMovement: (r: Omit<GrainMovement, 'id' | 'deleted_at' | 'seasonYear' | 'farm_id'> & { timestamp?: number }) => Promise<boolean>;
  updateGrainMovement: (r: GrainMovement) => Promise<boolean>;
  updateGrainMovementWithVersion: (r: GrainMovement, previous?: GrainMovement) => Promise<GrainMovement | false>;
  deleteGrainMovements: (ids: string[]) => Promise<boolean>;
  /** Calculation utility for bin inventory levels */
  getBinTotal: (binId: string, season?: number) => number;
  /** Operations for managing field definitions */
  addField: (field: Omit<Field, 'id' | 'farm_id'>, requestedId?: string) => Promise<boolean>;
  updateField: (field: Field) => Promise<boolean>;
  /**
   * Notes-only unmount flush for FieldNotes. Serializes behind an in-flight
   * field update so newer keystrokes cannot lose to an older autosave draft.
   */
  flushFieldNotes: (field: Field) => Promise<boolean>;
  deleteField: (id: string) => Promise<boolean>;
  /** Operations for managing bin definitions */
  addBin: (bin: Omit<Bin, 'id' | 'farm_id'>) => Promise<boolean>;
  updateBin: (bin: Bin) => Promise<boolean>;
  deleteBin: (id: string) => Promise<boolean>;
  /** Operations for managing seed varieties */
  addSeed: (name: string) => Promise<boolean>;
  deleteSeed: (id: string) => Promise<boolean>;
  /** Operations for managing spray recipes */
  addSprayRecipe: (recipe: Omit<SprayRecipe, 'id' | 'farm_id' | 'deleted_at'>) => Promise<boolean>;
  updateSprayRecipe: (recipe: SprayRecipe) => Promise<boolean>;
  deleteSprayRecipe: (id: string) => Promise<boolean>;
  /** Operations for managing fertilizer recipes */
  addFertilizerRecipe: (recipe: Omit<FertilizerRecipe, 'id' | 'farm_id'>) => Promise<boolean>;
  updateFertilizerRecipe: (recipe: Omit<FertilizerRecipe, 'farm_id'>) => Promise<boolean>;
  deleteFertilizerRecipe: (id: string) => Promise<boolean>;
  /** This-device sign out and cache clearing; deletion can request global scope. */
  deletionStatus: 'checking' | 'clear' | 'pending' | 'error';
  signOut: (options?: ClearLocalCacheOptions & { scope?: SignOutScope; preserveLocalData?: boolean }) => Promise<SignOutResult>;
  /** Clears all local application storage */
  clearLocalCache: (options?: ClearLocalCacheOptions) => Promise<boolean>;
  /** Unique ID for the current farm */
  farm_id: string | null;
  /** Display name of the current farm */
  farmName: string | null;
  /** owner, admin, or worker. Null until the profile role is loaded. */
  farmRole: 'owner' | 'admin' | 'worker' | null;
  /** Update display name of the current farm */
  updateFarmName: (name: string) => Promise<boolean>;
  /** Turns the cattle feature on or off for the farm; saved through the offline queue. */
  updateRunsCattle: (value: boolean) => Promise<boolean>;
  /** Whether the user has completed the onboarding flow */
  onboardingComplete: boolean;
  /** False until a cached or profile onboarding flag has actually been read. */
  onboardingStatusKnown: boolean;
  /** Marks onboarding as complete on server & client */
  completeOnboarding: () => Promise<boolean>;
  /** Restores the entire farm state from a JSON backup */
  restoreFromBackup: (data: any, options?: import('./useSeasonManagement').RestoreFromBackupOptions) => Promise<boolean>;
  /** Refresh/refetch all farm data from Supabase */
  refresh: () => Promise<boolean>;
  /** Operations for managing FSA tract imports */
  importTract: (tractKey: string, filename: string, geojson: unknown, featureCount: number) => Promise<boolean>;
  deleteTract: (id: string) => Promise<boolean>;
  /** County assignment operations (preview/apply backfill, manual correction, restore automatic, review) */
  previewCounties: ReturnType<typeof useCountyAssignments>['previewCounties'];
  applyCountyPlan: ReturnType<typeof useCountyAssignments>['applyCountyPlan'];
  recalculateCounties: ReturnType<typeof useCountyAssignments>['recalculateCounties'];
  saveCountySplit: ReturnType<typeof useCountyAssignments>['saveManualSplit'];
  restoreCountyAutomatic: ReturnType<typeof useCountyAssignments>['restoreAutomatic'];
  markCountyReviewed: ReturnType<typeof useCountyAssignments>['markReviewed'];
  /** Operations for managing CLU-to-field assignments */
  assignClu: (fieldId: string, tractKey: string, cluNumber: string, acres: number, landUse?: CluLandUse) => Promise<boolean>;
  updateCluLandUse: (assignmentId: string, landUse: CluLandUse) => Promise<boolean>;
  unassignClu: (fieldId: string, tractKey: string, cluNumber: string) => Promise<boolean>;
  /** Operations for managing outbound work requests */
  addWorkRequest: (
    r: Omit<WorkRequest, 'id' | 'timestamp' | 'deleted_at' | 'farm_id'>,
    onCreated?: (record: WorkRequest) => void,
  ) => Promise<boolean>;
  updateWorkRequest: (r: WorkRequest) => Promise<boolean>;
  deleteWorkRequests: (ids: string[]) => Promise<boolean>;
  addEquipment: (record: Omit<Equipment, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>) => Promise<boolean>;
  updateEquipment: (record: Equipment) => Promise<boolean>;
  updateEquipmentReading: (id: string, reading: number, force?: boolean) => Promise<'saved' | 'warning' | 'failed'>;
  setEquipmentMeterUnit: (
    id: string,
    fromUnit: Equipment['meterUnit'],
    toUnit: Equipment['meterUnit'],
    options?: {
      currentReading?: number;
      schedules?: Array<{ id: string; intervalValue: number; lastDoneReading: number | null }>;
    },
  ) => Promise<boolean>;
  deleteEquipment: (id: string) => Promise<boolean>;
  addMaintenanceSchedule: (record: Omit<MaintenanceSchedule, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>) => Promise<boolean>;
  updateMaintenanceSchedule: (record: MaintenanceSchedule, options?: { baselineEdited?: boolean }) => Promise<boolean>;
  deleteMaintenanceSchedule: (id: string) => Promise<boolean>;
  logMaintenance: (record: Omit<MaintenanceLog, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>, forceLower?: boolean) => Promise<boolean>;
  updateMaintenanceLog: (record: MaintenanceLog) => Promise<boolean>;
  deleteMaintenanceLog: (id: string) => Promise<boolean>;
  addCattleGroup: (record: Omit<CattleGroup, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at' | 'currentFieldId' | 'currentSince'>) => Promise<boolean>;
  updateCattleGroup: (id: string, changes: CattleGroupEdit) => Promise<boolean>;
  moveCattleGroup: (record: Pick<CattleMove, 'groupId' | 'fieldId' | 'movedOn' | 'notes'>) => Promise<boolean>;
  logCattleEvent: (record: Omit<CattleEvent, 'id' | 'farm_id' | 'createdAt' | 'updatedAt' | 'deleted_at'>, options?: CattleSaveOptions) => Promise<boolean>;
  transferCattleHead: (input: { fromGroupId: string; toGroupId: string; head: number; eventDate: string; notes?: string }, options?: CattleSaveOptions) => Promise<boolean>;
  deleteCattleGroup: (id: string) => Promise<boolean>;
  deleteCattleMove: (id: string) => Promise<boolean>;
  deleteCattleEvent: (id: string) => Promise<boolean>;
}

const FarmContext = createContext<FarmState | null>(null);

/** User-scoped offline cache table for the current farm's display name. */
const FARM_NAME_CACHE_TABLE = 'farm_name';
const FARM_SETTINGS_CACHE_TABLE = 'farm_settings';

function farmIdFromIdentityKey(identity: string): string {
  const splitAt = identity.indexOf(':');
  return splitAt === -1 ? '' : identity.slice(splitAt + 1);
}

function readCachedFarmName(data: unknown, farmId: string): string | null {
  if (!farmId || !Array.isArray(data) || data.length === 0) return null;
  const entry = data[0];
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as { farmId?: unknown; name?: unknown };
  if (record.farmId !== farmId || typeof record.name !== 'string') return null;
  const name = record.name.trim();
  return name || null;
}

function farmNameCacheValue(farmId: string, name: string): { farmId: string; name: string }[] {
  return [{ farmId, name }];
}

function readCachedRunsCattle(data: unknown, farmId: string): boolean | null {
  if (!farmId || !Array.isArray(data) || data.length === 0) return null;
  const entry = data[0];
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as { farmId?: unknown; runsCattle?: unknown };
  return record.farmId === farmId && typeof record.runsCattle === 'boolean' ? record.runsCattle : null;
}

export function FarmProvider({ children }: { children: ReactNode }) {
  // --- Auth & Session ---
  const auth = useAuth();
  const [fetchError, setFetchError] = useState(false);
  const {
    session, loading, setLoading,
    farm_id, setFarmId,
    activeSeason, setActiveSeason,
    viewingSeason, setViewingSeason,
    onboardingComplete, setOnboardingComplete, onboardingStatusKnown, farmRole, ensureFarm,
  } = auth;
  const sessionResolved = session !== undefined;
  const sessionUserId = session?.user?.id ?? null;
  const sessionUserIdRef = useRef(sessionUserId);
  sessionUserIdRef.current = sessionUserId;
  const identityKey = sessionUserId && farm_id ? `${sessionUserId}:${farm_id}` : null;

  const [farmName, setFarmName] = useState<string | null>(null);
  const [runsCattle, setRunsCattle] = useState(false);

  // --- Data State ---
  const [fields, setFields] = useState<Field[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [plantRecords, setPlantRecords] = useState<PlantRecord[]>([]);
  const [sprayRecords, setSprayRecords] = useState<SprayRecord[]>([]);
  const [harvestRecords, setHarvestRecords] = useState<HarvestRecord[]>([]);
  const [hayHarvestRecords, setHayHarvestRecords] = useState<HayHarvestRecord[]>([]);
  const [customSprayRecords, setCustomSprayRecords] = useState<CustomSprayRecord[]>([]);
  const [fertilizerApplications, setFertilizerApplications] = useState<FertilizerApplication[]>([]);
  const [tillageRecords, setTillageRecords] = useState<TillageRecord[]>([]);
  const [grainMovements, setGrainMovements] = useState<GrainMovement[]>([]);
  const [savedSeeds, setSavedSeeds] = useState<SavedSeed[]>([]);
  const [fertilizerRecipes, setFertilizerRecipes] = useState<FertilizerRecipe[]>([]);
  const [sprayRecipes, setSprayRecipes] = useState<SprayRecipe[]>([]);
  const [fsaTracts, setFsaTracts] = useState<FsaTractImport[]>([]);
  const [cluAssignments, setCluAssignments] = useState<FieldCluAssignment[]>([]);
  const [countyAssignments, setCountyAssignments] = useState<CountyAssignment[]>([]);
  const [workRequests, setWorkRequests] = useState<WorkRequest[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [maintenanceSchedules, setMaintenanceSchedules] = useState<MaintenanceSchedule[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [cattleGroups, setCattleGroups] = useState<CattleGroup[]>([]);
  const [cattleMoves, setCattleMoves] = useState<CattleMove[]>([]);
  const [cattleEvents, setCattleEvents] = useState<CattleEvent[]>([]);

  // --- Network & Offline State ---
  const { isOnline } = useNetworkStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [syncQueueLocked, setSyncQueueLocked] = useState(true);
  const [syncQueueReadFailed, setSyncQueueReadFailed] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [stateOwnerKey, setStateOwnerKey] = useState<string | null>(null);
  // True once the authoritative initial data load has settled for this session.
  // Online: set when fetchData resolves. Offline: set when cache hydration resolves.
  const [initialFetchComplete, setInitialFetchComplete] = useState(false);
  const [equipmentLoadFailed, setEquipmentLoadFailed] = useState(false);
  const [cattleLoadFailed, setCattleLoadFailed] = useState(false);
  const [dataLoadSource, setDataLoadSource] = useState<'cloud' | 'cache'>('cache');
  const [dataLoadedAt, setDataLoadedAt] = useState<string | null>(null);
  // Mirror isOnline in a ref so effects that must NOT re-run on network changes
  // (e.g. cache hydration) can still read the latest status when they settle.
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  const identityRef = useRef(identityKey);
  identityRef.current = identityKey;
  const latestFetchRequestRef = useRef(0);
  // Monotonic stamp for user renames. Farms reads and startup cache hydration
  // capture it when they start and drop the name if a rename has moved on, so
  // a slow refresh or restore cannot put the previous name back into state or
  // the farm_name cache.
  const farmNameGenerationRef = useRef(0);
  const equipmentStateRef = useRef({ equipment, maintenanceSchedules, maintenanceLogs });
  useEffect(() => { equipmentStateRef.current = { equipment, maintenanceSchedules, maintenanceLogs }; });
  const cattleStateRef = useRef({ cattleGroups, cattleMoves, cattleEvents });
  useEffect(() => { cattleStateRef.current = { cattleGroups, cattleMoves, cattleEvents }; });
  // Bumped by every switch of the setting, so a load that started earlier
  // cannot put the old value back.
  const runsCattleGenerationRef = useRef(0);
  const runsCattleRef = useRef(runsCattle);
  useEffect(() => { runsCattleRef.current = runsCattle; }, [runsCattle]);

  const clearFarmData = useCallback(() => {
    setFields([]);
    setBins([]);
    setPlantRecords([]);
    setSprayRecords([]);
    setHarvestRecords([]);
    setHayHarvestRecords([]);
    setCustomSprayRecords([]);
    setFertilizerApplications([]);
    setTillageRecords([]);
    setGrainMovements([]);
    setSavedSeeds([]);
    setFertilizerRecipes([]);
    setSprayRecipes([]);
    setFsaTracts([]);
    setCluAssignments([]);
    setCountyAssignments([]);
    setWorkRequests([]);
    setEquipment([]);
    setMaintenanceSchedules([]);
    setMaintenanceLogs([]);
    setCattleGroups([]);
    setCattleMoves([]);
    setCattleEvents([]);
    setFarmName(null);
    setRunsCattle(false);
  }, []);

  const updatePendingSyncCount = useCallback(async () => {
    const requestIdentity = identityKey;
    if (farm_id && requestIdentity) {
      try {
        const [count, failed] = await Promise.all([
          syncQueue.getPendingCount(farm_id),
          syncQueue.getFailed(farm_id),
        ]);
        if (identityRef.current === requestIdentity) {
          // Exhausted changes stay queued but must not block sign-out or
          // account deletion forever.
          setPendingSyncCount(Math.max(0, count - failed.length));
          setFailedSyncCount(failed.length);
          setSyncQueueLocked(false);
          setSyncQueueReadFailed(false);
        }
      } catch (err) {
        console.error('Failed to read pending sync count:', err);
        if (identityRef.current === requestIdentity) {
          setSyncQueueLocked(true);
          setSyncQueueReadFailed(true);
        }
      }
    } else {
      setPendingSyncCount(0);
      setFailedSyncCount(0);
      setSyncQueueLocked(false);
      setSyncQueueReadFailed(false);
    }
  }, [farm_id, identityKey]);

  const getFailedSyncChanges = useCallback(
    async () => (farm_id ? syncQueue.getFailed(farm_id) : []),
    [farm_id],
  );
  const discardFailedSyncChanges = useCallback(async () => {
    if (!farm_id) return 0;
    const removed = await syncQueue.discardFailed(farm_id);
    await updatePendingSyncCount();
    return removed;
  }, [farm_id, updatePendingSyncCount]);

  useEffect(() => {
    updatePendingSyncCount();
  }, [farm_id, updatePendingSyncCount]);

  // Hydrate local cache only after auth state is resolved.
  // Keyed on primitives only: TOKEN_REFRESHED delivers a new session object for
  // the same user roughly hourly, and keying on the object re-ran this effect,
  // re-hydrated state from a possibly stale cache snapshot, and permanently
  // reset initialFetchComplete (the fetch effect below does not re-run on a
  // token refresh, so nothing restored the flag).
  useEffect(() => {
    if (!sessionResolved) return;

    // Invalidate every older cloud request and remove the previous owner's data
    // before any new cache can hydrate. stateOwnerKey also prevents persistence
    // effects in this same commit from writing old state under the new user ID.
    latestFetchRequestRef.current += 1;
    setCacheHydrated(false);
    setInitialFetchComplete(false);
    setEquipmentLoadFailed(false);
    setCattleLoadFailed(false);
    setDataLoadSource('cache');
    setDataLoadedAt(null);
    setStateOwnerKey(null);
    setFetchError(false);
    setPendingSyncCount(0);
    setFailedSyncCount(0);
    setSyncQueueLocked(!!identityKey);
    setSyncQueueReadFailed(false);
    setLastSync(null);
    clearFarmData();

    if (!identityKey || !sessionUserId) {
      setCacheHydrated(true);
      setLoading(false);
      return;
    }

    const userId = sessionUserId;
    const hydrationIdentity = identityKey;
    let cancelled = false;
    const hydrateCache = async () => {
      // Captured before farm_name loadCache settles. A restore that started
      // before a rename is stale: applying it would overwrite the new name,
      // and the cache effect would persist that stale name. Skipping
      // setFarmName leaves every other collection on this path unchanged.
      const farmNameGeneration = farmNameGenerationRef.current;
      try {
        const countyCached = await offlineStorage.loadCache('county_assignments', userId);
        const [
          fieldsData, binsData, plantData, sprayData, harvestData, hayData, customSprayData,
          fertilizerData, tillageData, grainData, seedsData, fertilizerRecipesData, recipesData,
          tractsData, assignmentsData, workRequestsData, equipmentData,
          maintenanceSchedulesData, maintenanceLogsData, cattleGroupsData,
          cattleMovesData, cattleEventsData, farmNameData, farmSettingsData,
        ] = await Promise.all([
          offlineStorage.loadCache('fields', userId),
          offlineStorage.loadCache('bins', userId),
          offlineStorage.loadCache('plant_records', userId),
          offlineStorage.loadCache('spray_records', userId),
          offlineStorage.loadCache('harvest_records', userId),
          offlineStorage.loadCache('hay_harvest_records', userId),
          offlineStorage.loadCache('custom_spray_records', userId),
          offlineStorage.loadCache('fertilizer_applications', userId),
          offlineStorage.loadCache('tillage_records', userId),
          offlineStorage.loadCache('grain_movements', userId),
          offlineStorage.loadCache('saved_seeds', userId),
          offlineStorage.loadCache('fertilizer_recipes', userId),
          offlineStorage.loadCache('spray_recipes', userId),
          offlineStorage.loadCache('fsa_tract_imports', userId),
          offlineStorage.loadCache('field_clu_assignments', userId),
          offlineStorage.loadCache('work_requests', userId),
          offlineStorage.loadCache('equipment', userId),
          offlineStorage.loadCache('maintenance_schedules', userId),
          offlineStorage.loadCache('maintenance_logs', userId),
          offlineStorage.loadCache('cattle_groups', userId),
          offlineStorage.loadCache('cattle_moves', userId),
          offlineStorage.loadCache('cattle_events', userId),
          offlineStorage.loadCache(FARM_NAME_CACHE_TABLE, userId),
          offlineStorage.loadCache(FARM_SETTINGS_CACHE_TABLE, userId),
        ]);

        if (cancelled || identityRef.current !== hydrationIdentity) return;

        if (fieldsData) setFields(fieldsData);
        if (binsData) setBins(binsData);
        if (plantData) setPlantRecords(plantData);
        if (sprayData) setSprayRecords(sprayData);
        if (harvestData) setHarvestRecords(harvestData);
        if (hayData) setHayHarvestRecords(hayData);
        if (customSprayData) setCustomSprayRecords(customSprayData);
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
        if (countyCached) setCountyAssignments(countyCached);
        if (workRequestsData) setWorkRequests(workRequestsData);
        if (equipmentData) setEquipment(equipmentData);
        if (maintenanceSchedulesData) setMaintenanceSchedules(maintenanceSchedulesData);
        if (maintenanceLogsData) setMaintenanceLogs(maintenanceLogsData);
        if (cattleGroupsData) setCattleGroups(cattleGroupsData);
        if (cattleMovesData) setCattleMoves(cattleMovesData);
        if (cattleEventsData) setCattleEvents(cattleEventsData);
        const hydratedFarmName = readCachedFarmName(farmNameData, farmIdFromIdentityKey(hydrationIdentity));
        const hydratedRunsCattle = readCachedRunsCattle(farmSettingsData, farmIdFromIdentityKey(hydrationIdentity));
        const renameStillCurrent = farmNameGenerationRef.current === farmNameGeneration;
        if (hydratedFarmName && renameStillCurrent) setFarmName(hydratedFarmName);
        if (hydratedRunsCattle !== null) setRunsCattle(hydratedRunsCattle);
        setStateOwnerKey(hydrationIdentity);
      } catch (err) {
        if (!cancelled && identityRef.current === hydrationIdentity) {
          console.error('Failed to hydrate store from offline cache:', err);
        }
      } finally {
        if (!cancelled && identityRef.current === hydrationIdentity) {
          setCacheHydrated(true);
          setDataLoadSource('cache');
          setDataLoadedAt(new Date().toISOString());
          // When offline, the local cache is the authoritative source — mark the
          // initial load settled. Online users wait for fetchData instead.
          if (!isOnlineRef.current) setInitialFetchComplete(true);
        }
      }
    };
    hydrateCache();
    updatePendingSyncCount();
    return () => { cancelled = true; };
  }, [clearFarmData, identityKey, sessionResolved, sessionUserId, setLoading, updatePendingSyncCount]);

  // --- Fetch data when farm_id is stable ---
  const fetchData = useCallback(async (): Promise<boolean> => {
    const requestIdentity = identityKey;
    if (!sessionUserId || !farm_id || !requestIdentity || !cacheHydrated) return false;
    const requestId = ++latestFetchRequestRef.current;
    const isCurrentRequest = () =>
      identityRef.current === requestIdentity && latestFetchRequestRef.current === requestId;
    if (!isOnline) {
      // Offline with a valid farm: the local cache is authoritative, so the
      // initial load has settled. Mirrors the cache-hydration path and covers
      // the case where hydration ran while online before the network dropped.
      if (isCurrentRequest()) setInitialFetchComplete(true);
      return true;
    }
    // Only the first authoritative load owns the full-screen loading state.
    // Reconnect/background refreshes must not unmount active forms or discard
    // unsaved input while newer cloud data is fetched.
    const ownsInitialLoadingState = !initialFetchComplete;
    if (ownsInitialLoadingState) setLoading(true);
    setFetchError(false);
    try {
      // Complete-collection reads must be paginated (Data API max_rows cap) and
      // deterministically ordered with a unique tiebreaker, or collections larger
      // than one page are silently truncated or skip rows between pages.
      // Activity queries intentionally span ALL seasons — bin inventory and
      // history are physical, cross-season state; filtering by viewingSeason
      // here would make carryover grain vanish.
      const pagedQuery = (table: string) =>
        fetchAllPages((from, to) =>
          supabase.from(table)
            .select('*')
            .eq('farm_id', farm_id)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(from, to),
        );
      const pagedSeasonQuery = (table: string) =>
        fetchAllPages((from, to) =>
          supabase.from(table)
            .select('*')
            .eq('farm_id', farm_id)
            .is('deleted_at', null)
            .order('season_year', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        );

      // Started beside the collection reads so a farms result is applied as
      // soon as it settles, including when another collection throws. A failed
      // or blank read must not wipe a name already hydrated for this identity.
      // A read that started before the latest rename is stale: applying its
      // name would overwrite the rename in state, and the cache effect would
      // persist that stale name. Skipping setFarmName skips that cache write.
      const farmNameGeneration = farmNameGenerationRef.current;
      const farmsRead = Promise.resolve(
        supabase.from('farms').select('name').eq('id', farm_id).single(),
      ).then((result) => {
        const name = !result.error && typeof result.data?.name === 'string'
          ? result.data.name.trim()
          : '';
        const renameStillCurrent = farmNameGenerationRef.current === farmNameGeneration;
        if (name && isCurrentRequest() && renameStillCurrent) setFarmName(name);
        return result;
      }).catch((error: unknown) => ({ data: null, error }));

      // The cattle setting is read on its own and is fail-soft: a database that
      // does not have farms.runs_cattle yet (client deployed before the
      // migration) must leave cattle as it was, never fail the whole load.
      const runsCattleGeneration = runsCattleGenerationRef.current;
      const serverRunsCattleRead = (async (): Promise<boolean | null> => {
        try {
          const result = await supabase.from('farms').select('runs_cattle').eq('id', farm_id).single();
          if (result.error) {
            console.warn('Cattle setting did not load; keeping the saved value.', result.error);
            return null;
          }
          return typeof result.data?.runs_cattle === 'boolean' ? result.data.runs_cattle : null;
        } catch (error) {
          console.warn('Cattle setting did not load; keeping the saved value.', error);
          return null;
        }
      })();
      // A switch still waiting in the offline queue wins over the server value,
      // so the tile and screen do not disappear until it has synced.
      const queuedRunsCattleRead = (async (): Promise<boolean | null> => {
        try {
          return queuedRunsCattle(await syncQueue.getQueue(farm_id), farm_id);
        } catch {
          return null;
        }
      })();

      const coreReads = Promise.all([
        pagedQuery('fields'),
        pagedQuery('bins'),
        pagedSeasonQuery('plant_records'),
        pagedSeasonQuery('spray_records'),
        pagedSeasonQuery('harvest_records'),
        pagedSeasonQuery('hay_harvest_records'),
        pagedSeasonQuery('custom_spray_records'),
        fetchAllPages((from, to) =>
          supabase.from('fertilizer_applications')
            .select('*, fields(name)')
            .eq('farm_id', farm_id)
            .is('deleted_at', null)
            .order('season_year', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        pagedSeasonQuery('tillage_records'),
        pagedQuery('grain_movements'),
        pagedQuery('saved_seeds'),
        pagedQuery('fertilizer_recipes'),
        pagedQuery('spray_recipes'),
        pagedQuery('fsa_tract_imports'),
        pagedQuery('field_clu_assignments'),
        fetchAllPages((from, to) =>
          supabase.from('work_requests')
            .select('*')
            .eq('farm_id', farm_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        ),
        pagedQuery('equipment'),
        pagedQuery('maintenance_schedules'),
        fetchAllPages((from, to) =>
          supabase.from('maintenance_logs')
            .select('*')
            .eq('farm_id', farm_id)
            .is('deleted_at', null)
            .order('performed_on', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        ),
      ]);

      const [farmResult, serverRunsCattle, queuedRunsCattleValue] = await Promise.all([
        farmsRead, serverRunsCattleRead, queuedRunsCattleRead,
      ]);
      if (!isCurrentRequest()) return false;
      const runsCattleStillCurrent = runsCattleGenerationRef.current === runsCattleGeneration;
      const loadedRunsCattle = runsCattleStillCurrent ? (queuedRunsCattleValue ?? serverRunsCattle) : null;
      if (loadedRunsCattle !== null) {
        setRunsCattle(loadedRunsCattle);
        runsCattleRef.current = loadedRunsCattle;
      }
      const shouldFetchCattle = (loadedRunsCattle ?? runsCattleRef.current) === true;
      const failSoftCattleQuery = async (table: string) => {
        try {
          return await pagedQuery(table);
        } catch (error) {
          console.warn(`Cattle table ${table} did not load; keeping its cache.`, error);
          return { rows: [], error: { message: error instanceof Error ? error.message : String(error) } };
        }
      };
      // County rows are fail-soft: a missing table (migration not yet applied) must not block the
      // rest of the farm. The cached copy stays visible when the read fails.
      const countyRead = (async () => {
        try {
          return await pagedQuery('county_assignments');
        } catch (error) {
          console.warn('County assignments did not load; keeping the cache.', error);
          return { rows: [], error: { message: error instanceof Error ? error.message : String(error) } };
        }
      })();
      const cattleReads = shouldFetchCattle
        ? Promise.all([
          failSoftCattleQuery('cattle_groups'),
          failSoftCattleQuery('cattle_moves'),
          failSoftCattleQuery('cattle_events'),
        ])
        : null;

      const [[
        fieldsPages, binsPages, plantPages, sprayPages, harvestPages,
        hayPages, customSprayPages, fertilizerPages, tillagePages, grainPages,
        seedsPages, fertilizerRecipesPages, recipesPages, tractsPages,
        assignmentsPages, workRequestsPages, equipmentPages,
        maintenanceSchedulesPages, maintenanceLogsPages,
      ], cattlePages, countyPages] = await Promise.all([coreReads, cattleReads, countyRead]);

      if (!isCurrentRequest()) return false;
      const { error: farmErr } = farmResult;
      if (!isCurrentRequest()) return false;

      // Equipment is fail-soft: a missing or failing equipment table must not
      // block every other collection from loading. Its state is only replaced
      // when all three reads succeed; otherwise the cached copy stays visible.
      const equipmentLoaded = !equipmentPages.error
        && !maintenanceSchedulesPages.error
        && !maintenanceLogsPages.error;
      if (!equipmentLoaded) {
        console.warn('Equipment data did not load; keeping cached equipment.', {
          equipment: equipmentPages.error,
          maintenanceSchedules: maintenanceSchedulesPages.error,
          maintenanceLogs: maintenanceLogsPages.error,
        });
      }
      setEquipmentLoadFailed(!equipmentLoaded);

      const cattleFailures = shouldFetchCattle
        ? (cattlePages ?? []).map(pages => pages.error).filter(Boolean)
        : [];
      if (cattleFailures.length > 0) {
        console.warn('Cattle data did not fully load; keeping cached rows for failed tables.', cattleFailures);
      }
      setCattleLoadFailed(cattleFailures.length > 0);

      const pagedErrors = [
        fieldsPages, binsPages, plantPages, sprayPages, harvestPages,
        hayPages, customSprayPages, fertilizerPages, tillagePages, grainPages,
        seedsPages, fertilizerRecipesPages, recipesPages, tractsPages,
        assignmentsPages, workRequestsPages,
      ]
        .map(pages => pages.error)
        .filter(Boolean);
      const fetchErrors = farmErr ? [...pagedErrors, farmErr] : pagedErrors;

          if (fetchErrors.length > 0) {
            console.error('Data fetch errors:', fetchErrors);
            setFetchError(true);
            toast.error('Some data failed to load from cloud. Showing local cache.');
            return false;
          }

          let queued: QueuedMutation[] = [];
          try {
            queued = await syncQueue.getQueue(farm_id);
          } catch (error) {
            if (!isOfflineDatabaseUnavailableError(error) && !(error instanceof WebSyncQueueUnreadableError)) throw error;
            console.error('Offline changes remain locked; loading cloud snapshot:', error);
            if (isCurrentRequest()) {
              setSyncQueueLocked(true);
              setSyncQueueReadFailed(true);
            }
          }
          if (!isCurrentRequest()) return false;
          const fieldsData = overlayQueuedRows('fields', fieldsPages.rows, queued, farm_id);
          const binsData = overlayQueuedRows('bins', binsPages.rows, queued, farm_id);
          const plantData = overlayQueuedRows('plant_records', plantPages.rows, queued, farm_id);
          const sprayData = overlayQueuedRows('spray_records', sprayPages.rows, queued, farm_id);
          const harvestData = overlayQueuedRows('harvest_records', harvestPages.rows, queued, farm_id);
          const hayData = overlayQueuedRows('hay_harvest_records', hayPages.rows, queued, farm_id);
          const customSprayData = overlayQueuedRows('custom_spray_records', customSprayPages.rows, queued, farm_id);
          const fertilizerData = overlayQueuedRows('fertilizer_applications', fertilizerPages.rows, queued, farm_id);
          const tillageData = overlayQueuedRows('tillage_records', tillagePages.rows, queued, farm_id);
          const grainData = overlayQueuedRows('grain_movements', grainPages.rows, queued, farm_id);
          const seedsData = overlayQueuedRows('saved_seeds', seedsPages.rows, queued, farm_id);
          const fertilizerRecipesData = overlayQueuedRows('fertilizer_recipes', fertilizerRecipesPages.rows, queued, farm_id);
          const recipesData = overlayQueuedRows('spray_recipes', recipesPages.rows, queued, farm_id);
          const tractsData = overlayQueuedRows('fsa_tract_imports', tractsPages.rows, queued, farm_id);
          const assignmentsData = overlayQueuedRows('field_clu_assignments', assignmentsPages.rows, queued, farm_id);
          const workRequestsData = overlayQueuedRows('work_requests', workRequestsPages.rows, queued, farm_id);
          let equipmentMapped: Equipment[] | null = null;
          let schedulesMapped: MaintenanceSchedule[] | null = null;
          let logsMapped: MaintenanceLog[] | null = null;
          if (equipmentLoaded) {
            equipmentMapped = overlayQueuedRows('equipment', equipmentPages.rows, queued, farm_id).map(mapEquipmentFromDb);
            schedulesMapped = overlayQueuedRows('maintenance_schedules', maintenanceSchedulesPages.rows, queued, farm_id).map(mapMaintenanceScheduleFromDb);
            logsMapped = overlayQueuedRows('maintenance_logs', maintenanceLogsPages.rows, queued, farm_id).map(mapMaintenanceLogFromDb);
            const merged = applyParkedEquipmentMutations(equipmentMapped, schedulesMapped, logsMapped, queued, true);
            equipmentMapped = merged.equipment;
            schedulesMapped = merged.schedules;
            logsMapped = merged.logs;
          } else {
            // Fail-soft: keep the cached equipment, but still show queued/parked work on it.
            const retained = equipmentStateRef.current;
            const merged = applyParkedEquipmentMutations(
              retained.equipment, retained.maintenanceSchedules, retained.maintenanceLogs, queued, true,
            );
            equipmentMapped = merged.equipment;
            schedulesMapped = merged.schedules;
            logsMapped = merged.logs;
          }

          const retainedCattle = cattleStateRef.current;
          let cattleGroupsMapped = retainedCattle.cattleGroups;
          let cattleMovesMapped = retainedCattle.cattleMoves;
          let cattleEventsMapped = retainedCattle.cattleEvents;
          if (shouldFetchCattle && cattlePages) {
            if (!cattlePages[0].error) {
              cattleGroupsMapped = overlayQueuedRows('cattle_groups', cattlePages[0].rows, queued, farm_id).map(mapCattleGroupFromDb);
            }
            if (!cattlePages[1].error) {
              cattleMovesMapped = overlayQueuedRows('cattle_moves', cattlePages[1].rows, queued, farm_id).map(mapCattleMoveFromDb);
            }
            if (!cattlePages[2].error) {
              cattleEventsMapped = overlayQueuedRows('cattle_events', cattlePages[2].rows, queued, farm_id).map(mapCattleEventFromDb);
            }
          }
          const cattleMerged = applyParkedCattleMutations(
            cattleGroupsMapped, cattleMovesMapped, cattleEventsMapped, queued, true,
          );

          setFields(fieldsData.map(mapFieldFromDb));
          setBins(binsData.map(mapBinFromDb));
          setPlantRecords(plantData.map(mapPlantFromDb));
          setSprayRecords(sprayData.map(mapSprayFromDb));
          setHarvestRecords(harvestData.map(mapHarvestFromDb));
          setHayHarvestRecords(hayData.map(mapHayFromDb));
          setCustomSprayRecords(customSprayData.map(mapCustomSprayFromDb));
          setFertilizerApplications(fertilizerData.map(mapFertilizerFromDb));
          setTillageRecords(tillageData.map(mapTillageFromDb));
          setGrainMovements(grainData.map(mapGrainFromDb));
          setSavedSeeds(seedsData.map(mapSeedFromDb));
          setFertilizerRecipes(fertilizerRecipesData.map(mapFertilizerRecipeFromDb));
          setSprayRecipes(recipesData.map(mapRecipeFromDb));
          setFsaTracts(tractsData.map(mapFsaTractFromDb));
          setCluAssignments(assignmentsData.map(mapFieldCluAssignmentFromDb));
          if (!countyPages.error) {
            setCountyAssignments(overlayQueuedRows('county_assignments', countyPages.rows, queued, farm_id).map(mapCountyAssignmentFromDb));
          }
          setWorkRequests(workRequestsData.map(mapWorkRequestFromDb));
          if (equipmentMapped && schedulesMapped && logsMapped) {
            setEquipment(equipmentMapped);
            setMaintenanceSchedules(schedulesMapped);
            setMaintenanceLogs(logsMapped);
          }
          if (shouldFetchCattle) {
            setCattleGroups(cattleMerged.groups);
            setCattleMoves(cattleMerged.moves);
            setCattleEvents(cattleMerged.events);
          }
          setStateOwnerKey(requestIdentity);

          // Loading is complete only once every page of every collection has
          // succeeded — a truncated or failed load must not look settled.
          setInitialFetchComplete(true);
          setDataLoadSource('cloud');
          setDataLoadedAt(new Date().toISOString());
          return true;
        } catch (error) {
          if (isCurrentRequest()) {
            console.error('Error fetching data:', error);
            setFetchError(true);
          }
          return false;
        } finally {
          if (isCurrentRequest() && ownsInitialLoadingState) setLoading(false);
        }
  }, [cacheHydrated, farm_id, identityKey, initialFetchComplete, isOnline, sessionUserId, setLoading]);

  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  });

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!farm_id || !identityKey || !cacheHydrated) return false;
    const refreshIdentity = identityKey;
    if (isOnline) {
      try {
        const drained = await syncQueue.replayQueue(farm_id);
        if (drained && identityRef.current === refreshIdentity) setLastSync(new Date());
      } catch (error) {
        if (!isOfflineDatabaseUnavailableError(error) && !(error instanceof WebSyncQueueUnreadableError)) {
          console.error('Sync replay failed; loading with queued changes preserved:', error);
        }
      } finally {
        await updatePendingSyncCount();
      }
    }
    if (identityRef.current !== refreshIdentity) return false;
    return fetchDataRef.current();
  }, [cacheHydrated, farm_id, identityKey, isOnline, updatePendingSyncCount]);

  const retryFailedSyncChanges = useCallback(async () => {
    if (!farm_id) return;
    await syncQueue.retryFailed(farm_id);
    await refresh();
  }, [farm_id, refresh]);

  useEffect(() => {
    if (!cacheHydrated || !identityKey || !farm_id) return;
    if (!isOnline) {
      setInitialFetchComplete(true);
      return;
    }
    void refresh().catch(error => console.error('Initial sync and load failed:', error));
  }, [cacheHydrated, farm_id, identityKey, isOnline, refresh]);

  // Every drain (including hook-triggered replay) refreshes status. Only an
  // empty remaining queue advances lastSync; realtime subscription does not.
  useEffect(() => {
    const onReplay = (event: Event) => {
      const detail = (event as CustomEvent<{ farmId: string; drained: boolean }>).detail;
      if (detail.farmId !== farm_id) return;
      if (detail.drained) setLastSync(new Date());
      void updatePendingSyncCount();
    };
    window.addEventListener('acreledger:sync-replayed', onReplay);
    return () => window.removeEventListener('acreledger:sync-replayed', onReplay);
  }, [farm_id, updatePendingSyncCount]);

  // --- Local storage persistence ---
  const cacheOwnerUserId = cacheHydrated && stateOwnerKey === identityKey ? sessionUserId : null;
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('fields', cacheOwnerUserId, fields); } }, [fields, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('bins', cacheOwnerUserId, bins); } }, [bins, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('plant_records', cacheOwnerUserId, plantRecords); } }, [plantRecords, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('spray_records', cacheOwnerUserId, sprayRecords); } }, [sprayRecords, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('harvest_records', cacheOwnerUserId, harvestRecords); } }, [harvestRecords, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('hay_harvest_records', cacheOwnerUserId, hayHarvestRecords); } }, [hayHarvestRecords, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('custom_spray_records', cacheOwnerUserId, customSprayRecords); } }, [customSprayRecords, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('fertilizer_applications', cacheOwnerUserId, fertilizerApplications); } }, [fertilizerApplications, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('tillage_records', cacheOwnerUserId, tillageRecords); } }, [tillageRecords, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('grain_movements', cacheOwnerUserId, grainMovements); } }, [grainMovements, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('saved_seeds', cacheOwnerUserId, savedSeeds); } }, [savedSeeds, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('fertilizer_recipes', cacheOwnerUserId, fertilizerRecipes); } }, [fertilizerRecipes, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('spray_recipes', cacheOwnerUserId, sprayRecipes); } }, [sprayRecipes, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('fsa_tract_imports', cacheOwnerUserId, fsaTracts); } }, [fsaTracts, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('field_clu_assignments', cacheOwnerUserId, cluAssignments); } }, [cluAssignments, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('county_assignments', cacheOwnerUserId, countyAssignments); } }, [countyAssignments, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('work_requests', cacheOwnerUserId, workRequests); } }, [workRequests, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('equipment', cacheOwnerUserId, equipment); } }, [equipment, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('maintenance_schedules', cacheOwnerUserId, maintenanceSchedules); } }, [maintenanceSchedules, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('maintenance_logs', cacheOwnerUserId, maintenanceLogs); } }, [maintenanceLogs, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('cattle_groups', cacheOwnerUserId, cattleGroups); } }, [cattleGroups, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('cattle_moves', cacheOwnerUserId, cattleMoves); } }, [cattleMoves, cacheOwnerUserId]);
  useEffect(() => { if (cacheOwnerUserId) { offlineStorage.saveCache('cattle_events', cacheOwnerUserId, cattleEvents); } }, [cattleEvents, cacheOwnerUserId]);
  useEffect(() => {
    if (!cacheOwnerUserId || !farm_id) return;
    const name = farmName?.trim();
    if (!name) return;
    void offlineStorage.saveCache(FARM_NAME_CACHE_TABLE, cacheOwnerUserId, farmNameCacheValue(farm_id, name));
  }, [farmName, farm_id, cacheOwnerUserId]);
  useEffect(() => {
    if (!cacheOwnerUserId || !farm_id) return;
    void offlineStorage.saveCache(FARM_SETTINGS_CACHE_TABLE, cacheOwnerUserId, [{ farmId: farm_id, runsCattle }]);
  }, [runsCattle, farm_id, cacheOwnerUserId]);
  useEffect(() => { saveToStorage('al_active_season', activeSeason, session?.user?.id); }, [activeSeason, session?.user?.id]);
  useEffect(() => { saveToStorage('al_viewing_season', viewingSeason, session?.user?.id); }, [viewingSeason, session?.user?.id]);
  useEffect(() => { saveToStorage('al_farm_id', farm_id, session?.user?.id); }, [farm_id, session?.user?.id]);

  // --- Compose CRUD hooks ---
  const plantOps = usePlantRecords({ farm_id, viewingSeason, plantRecords, setPlantRecords, isOnline, onMutation: updatePendingSyncCount });
  const sprayOps = useSprayRecords({ farm_id, viewingSeason, sprayRecords, setSprayRecords, isOnline, onMutation: updatePendingSyncCount });
  const harvestOps = useHarvestRecords({
    farm_id, viewingSeason, harvestRecords, setHarvestRecords,
    grainMovements, setGrainMovements, isOnline, onMutation: updatePendingSyncCount,
  });
  const hayOps = useHayRecords({ farm_id, viewingSeason, hayHarvestRecords, setHayHarvestRecords, isOnline, onMutation: updatePendingSyncCount });
  const customSprayOps = useCustomSprayRecords({ farm_id, viewingSeason, customSprayRecords, setCustomSprayRecords, isOnline, onMutation: updatePendingSyncCount });
  const fertilizerOps = useFertilizerRecords({ farm_id, viewingSeason, fields, fertilizerApplications, setFertilizerApplications, isOnline, onMutation: updatePendingSyncCount });
  const tillageOps = useTillageRecords({ farm_id, viewingSeason, tillageRecords, setTillageRecords, isOnline, onMutation: updatePendingSyncCount });
  const grainOps = useGrainMovements({ farm_id, viewingSeason, grainMovements, setGrainMovements, isOnline, onMutation: updatePendingSyncCount });
  const workRequestOps = useWorkRequests({ farm_id, workRequests, setWorkRequests, isOnline, onMutation: updatePendingSyncCount });
  const equipmentOps = useEquipment({
    farm_id, equipment, maintenanceSchedules, maintenanceLogs,
    setEquipment, setMaintenanceSchedules, setMaintenanceLogs,
    isOnline, onMutation: updatePendingSyncCount,
  });
  const cattleOps = useCattle({
    farm_id, cattleGroups, cattleMoves, cattleEvents,
    setCattleGroups, setCattleMoves, setCattleEvents,
    isOnline, onMutation: updatePendingSyncCount,
  });

  const tractOps = useFsaTracts({
    farm_id, fsaTracts, cluAssignments, setFsaTracts, setCluAssignments,
    isOnline, onMutation: updatePendingSyncCount,
  });

  const countyOps = useCountyAssignments({
    farm_id, userId: cacheOwnerUserId, fields, fsaTracts, cluAssignments, countyAssignments, setCountyAssignments,
    isOnline, ready: initialFetchComplete && !!cacheOwnerUserId, onMutation: updatePendingSyncCount,
  });

  const binTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    grainMovements.filter(m => !m.deleted_at).forEach(m => {
      const delta = getSignedBushels(m);
      const sKey = `${m.binId}-${m.seasonYear}`;
      totals[sKey] = (totals[sKey] || 0) + delta;

      const aKey = `${m.binId}-all`;
      totals[aKey] = (totals[aKey] || 0) + delta;
    });
    // Raw float sums drift (0.1 + 0.2 = 0.30000000000000004), so a bin showing
    // "3,000" could reject a 3,000 sale. Round to the 3 decimals the UI displays.
    for (const key of Object.keys(totals)) totals[key] = roundTo(totals[key], 3);
    return totals;
  }, [grainMovements]);

  const getBinTotal = useCallback((binId: string, season?: number) => {
    const key = season ? `${binId}-${season}` : `${binId}-all`;
    return binTotals[key] || 0;
  }, [binTotals]);

  const entityOps = useFieldsAndBins({
    farm_id, fields, bins, getBinTotal, savedSeeds, sprayRecipes, fertilizerRecipes, cluAssignments,
    setFields, setBins,
    setSavedSeeds,
    setFertilizerRecipes,
    setSprayRecipes,
    setCluAssignments,
    isOnline,
    onMutation: updatePendingSyncCount,
  });

  const seasonOps = useSeasonManagement({
    session, farm_id,
    fields, bins, plantRecords, sprayRecords, harvestRecords,
    hayHarvestRecords, customSprayRecords, fertilizerApplications, tillageRecords, grainMovements,
    savedSeeds, fertilizerRecipes, sprayRecipes, fsaTracts, cluAssignments, workRequests,
    equipment, maintenanceSchedules, maintenanceLogs,
    cattleGroups, cattleMoves, cattleEvents, activeSeason, viewingSeason,
    setActiveSeason, setViewingSeason, setLoading,
    setFields, setBins, setPlantRecords, setSprayRecords,
    setHarvestRecords, setHayHarvestRecords, setCustomSprayRecords, setFertilizerApplications,
    setTillageRecords, setGrainMovements, setSavedSeeds, setFertilizerRecipes, setSprayRecipes, setFarmId,
    setFsaTracts, setCluAssignments, setWorkRequests,
    setEquipment, setMaintenanceSchedules, setMaintenanceLogs,
    setCattleGroups, setCattleMoves, setCattleEvents,
    refetchFarmData: fetchData,
    isOnline,
    initialFetchComplete,
    fetchError,
    pendingSyncCount,
    farmRole,
  });

  // --- Composed signOut (auth + cache clear) ---
  const clearLocalCache = seasonOps.clearLocalCache;
  const authSignOut = auth.signOut;
  const [signingOut, setSigningOut] = useState(false);
  const signOut = useCallback(async (options?: ClearLocalCacheOptions & { scope?: SignOutScope; preserveLocalData?: boolean }): Promise<SignOutResult> => {
    setSigningOut(true);
    try {
      let result: SignOutResult;
      try {
        result = await authSignOut(options?.scope ?? 'local');
      } catch (error) {
        console.error('Could not end local session:', error);
        toast.error('Could not sign out on this device. Please try again.');
        return { signedOut: false, serverPending: true };
      }
      // Deletion-pending users cannot sync or inspect their queue. Leave it
      // scoped to its owner instead of discarding work from that screen.
      if (options?.preserveLocalData) return { ...result, cacheCleared: false };
      let cacheCleared = false;
      try {
        cacheCleared = await clearLocalCache(options);
      } catch (error) {
        console.error('Could not clear local records after sign-out:', error);
        toast.error('Signed out on this device; some local records could not be cleared.');
      }
      return { ...result, cacheCleared };
    } finally {
      setSigningOut(false);
    }
  }, [authSignOut, clearLocalCache]);

  // --- Derived data ---
  const seasonOptions = useMemo(() => {
    return buildSeasonOptions(activeSeason, [
      plantRecords,
      sprayRecords,
      harvestRecords,
      hayHarvestRecords,
      customSprayRecords,
      fertilizerApplications,
      tillageRecords,
      grainMovements,
    ]);
  }, [
    activeSeason,
    plantRecords,
    sprayRecords,
    harvestRecords,
    hayHarvestRecords,
    customSprayRecords,
    fertilizerApplications,
    tillageRecords,
    grainMovements,
  ]);

  const selectViewingSeason = useCallback((year: number) => {
    if (!isValidViewingSeason(year, activeSeason)) {
      toast.error(`Season must be between ${activeSeason - 10} and ${getMaxViewingSeason(activeSeason)}.`);
      return;
    }
    setViewingSeason(year);
  }, [activeSeason, setViewingSeason]);

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

  const updateFarmName = useCallback(async (newName: string): Promise<boolean> => {
    const userId = session?.user?.id;
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('Farm name cannot be empty.');
      return false;
    }

    // Any farms read that already started predates this attempt. Bump again
    // only once the new name is applied, so a read that raced the write and
    // still has the previous name is also stale. A failed attempt leaves the
    // counter here: a read started after this attempt still applies.
    farmNameGenerationRef.current += 1;
    const requestIdentity = identityRef.current;
    try {
      const resolvedFarmId = farm_id || await ensureFarm();
      if (!resolvedFarmId) return false;
      if (!userId || sessionUserIdRef.current !== userId) return false;
      if (requestIdentity && identityRef.current !== requestIdentity) return false;
      const { error } = await supabase.rpc('update_farm_name', { p_name: trimmed });
      if (error) throw error;
      if (sessionUserIdRef.current !== userId) return false;
      if (requestIdentity && identityRef.current !== requestIdentity) return false;

      farmNameGenerationRef.current += 1;
      setFarmName(trimmed);
      try {
        await offlineStorage.saveCache(FARM_NAME_CACHE_TABLE, userId, farmNameCacheValue(resolvedFarmId, trimmed));
      } catch (cacheError) {
        console.error('Failed to cache farm name:', cacheError);
      }
      if (sessionUserIdRef.current !== userId) return false;
      toast.success('Farm name updated successfully.');
      return true;
    } catch (err: any) {
      console.error('Error updating farm name:', err);
      toast.error(err.message || 'Failed to update farm name.');
      return false;
    }
  }, [ensureFarm, farm_id, session]);

  const updateRunsCattle = useCallback(async (value: boolean): Promise<boolean> => {
    if (!farm_id) { toast.error('No farm selected.'); return false; }
    const previous = runsCattleRef.current;
    if (previous === value) return true;
    runsCattleGenerationRef.current += 1;
    setRunsCattle(value);
    runsCattleRef.current = value;
    const args = { p_runs_cattle: value };
    const payload = { id: farm_id, [CATTLE_RPC_KEY]: { rpc: 'set_runs_cattle', args } };
    const revert = () => {
      // Only undo our own change; a newer toggle keeps its value.
      if (runsCattleRef.current === value) { setRunsCattle(previous); runsCattleRef.current = previous; }
    };
    const enqueue = async (): Promise<boolean> => {
      try {
        await syncQueue.enqueueMutation('farms', 'update', payload, farm_id);
        if (isOnline) syncQueue.kickReplay(farm_id, updatePendingSyncCount);
        return true;
      } catch (error) {
        console.error('Failed to queue the cattle setting:', error);
        return false;
      }
    };
    let ok: boolean;
    let savedOnServer = false;
    if (await syncQueue.shouldQueueWrite(isOnline, farm_id, [{ tableName: 'farms', id: farm_id }])) {
      ok = await enqueue();
    } else {
      try {
        const { error } = await supabase.rpc('set_runs_cattle', { ...args, p_farm_id: farm_id });
        ok = error ? (isUnknownMutationOutcome(error) ? await enqueue() : false) : true;
        savedOnServer = !error;
        if (error && !ok) console.error('Failed to save the cattle setting:', error);
      } catch (error) {
        ok = isUnknownMutationOutcome(error) ? await enqueue() : false;
      }
    }
    // A load that was reading the setting while this save was in flight may
    // hold the old server value; bumping again makes it drop that value.
    runsCattleGenerationRef.current += 1;
    if (!ok) { revert(); toast.error('Could not save the cattle setting.'); }
    // Cattle rows are not fetched while the setting is off, so load them now.
    // A device with no cached cattle would otherwise show an empty list.
    if (ok && value && savedOnServer) void fetchDataRef.current();
    return ok;
  }, [farm_id, isOnline, updatePendingSyncCount]);

  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    const userId = session?.user?.id;
    if (!userId) {
      toast.error('Authentication required.');
      return false;
    }

    try {
      if (!farm_id && !await ensureFarm()) return false;
      if (sessionUserIdRef.current !== userId) return false;
      const { error, count } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true }, { count: 'exact' })
        .eq('id', userId);
      if (error) throw error;
      // Exactly one profile row must change. Zero (missing profile, RLS drift) or a
      // missing/null count means the cloud flag may still be false, so do not mark
      // this device complete either.
      if (count !== 1) throw new Error('Could not save your setup. Please try again.');

      if (sessionUserIdRef.current !== userId) return false;
      setOnboardingComplete(true);
      try {
        localStorage.setItem(`${userId}_al_onboarding_complete`, '1');
      } catch (storageError) {
        console.error('Failed to cache onboarding progress:', storageError);
      }
      return true;
    } catch (err: any) {
      console.error('Error completing onboarding:', err);
      toast.error(err.message || 'Failed to save onboarding progress. Please try again.');
      return false;
    }
  }, [ensureFarm, farm_id, session, setOnboardingComplete]);

  return (
    <FarmContext.Provider value={{
      deletionStatus: auth.deletionStatus,
      session, isOnline, pendingSyncCount, failedSyncCount, syncQueueLocked, syncQueueReadFailed, lastSync, retryFailedSyncChanges, getFailedSyncChanges, discardFailedSyncChanges, loading: loading || signingOut, initialFetchComplete, fetchError, equipmentLoadFailed, cattleLoadFailed, dataLoadSource, dataLoadedAt,
      fields: sortedFields,
      bins: filteredBins,
      plantRecords, sprayRecords, harvestRecords, hayHarvestRecords, customSprayRecords,
      fertilizerApplications,
      tillageRecords,
      grainMovements,
      savedSeeds,
      fertilizerRecipes,
      sprayRecipes,
      fsaTracts,
      cluAssignments,
      countyAssignments,
      workRequests,
      equipment: equipment.filter(item => !item.deleted_at),
      maintenanceSchedules: maintenanceSchedules.filter(item => !item.deleted_at),
      maintenanceLogs: maintenanceLogs.filter(item => !item.deleted_at),
      runsCattle,
      cattleGroups: cattleGroups.filter(item => !item.deleted_at),
      cattleMoves: cattleMoves.filter(item => !item.deleted_at),
      cattleEvents: cattleEvents.filter(item => !item.deleted_at),
      activeSeason, viewingSeason, seasonOptions, setViewingSeason: selectViewingSeason,
      rolloverToNewSeason: seasonOps.rolloverToNewSeason,
      undoPreSeasonReset: seasonOps.undoPreSeasonReset,
      ...plantOps,
      ...sprayOps,
      ...harvestOps,
      ...hayOps,
      ...customSprayOps,
      ...fertilizerOps,
      ...tillageOps,
      ...grainOps,
      ...workRequestOps,
      ...equipmentOps,
      ...cattleOps,
      getBinTotal,
      ...entityOps,
      signOut,
      clearLocalCache: seasonOps.clearLocalCache,
      farm_id,
      farmName,
      farmRole,
      updateFarmName,
      updateRunsCattle,
      onboardingComplete,
      onboardingStatusKnown,
      completeOnboarding,
      restoreFromBackup: seasonOps.restoreFromBackup,
      refresh,
      importTract: tractOps.importTract,
      deleteTract: tractOps.deleteTract,
      previewCounties: countyOps.previewCounties,
      applyCountyPlan: countyOps.applyCountyPlan,
      recalculateCounties: countyOps.recalculateCounties,
      saveCountySplit: countyOps.saveManualSplit,
      restoreCountyAutomatic: countyOps.restoreAutomatic,
      markCountyReviewed: countyOps.markReviewed,
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
