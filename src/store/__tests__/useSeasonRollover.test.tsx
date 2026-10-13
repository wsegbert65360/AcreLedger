/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';
let useSeasonManagement: typeof import('../useSeasonManagement')['useSeasonManagement'];
const supabaseMock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
beforeAll(async () => { ({ useSeasonManagement } = await import('../useSeasonManagement')); });
import { exportDataAsJson } from '@/utils/backup';

const clearQueue = vi.hoisted(() => vi.fn());
const offlineStore = vi.hoisted(() => ({ unavailable: false }));

vi.mock('@/utils/backup', () => ({ exportDataAsJson: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/syncQueue', () => ({ syncQueue: { clearQueue, getPendingCount: vi.fn().mockResolvedValue(0), replayQueue: vi.fn() } }));
vi.mock('@/lib/offlineStorage', () => ({
  offlineStorage: { clearCache: vi.fn().mockResolvedValue(undefined) },
  isNativeOfflineStoreUnavailable: () => offlineStore.unavailable,
  isOfflineDatabaseUnavailableError: (error: unknown) =>
    error instanceof Error && error.message === 'Offline database unavailable.',
  OFFLINE_DATABASE_UNAVAILABLE: 'Offline database unavailable.',
  OFFLINE_STORE_UNAVAILABLE_MESSAGE: 'This phone cannot open its offline records. Stay signed in so unsynced work is not lost.',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeArgs(overrides: Record<string, unknown> = {}) {
  const setActiveSeason = vi.fn();
  const setViewingSeason = vi.fn();
  return {
    session: { user: { id: 'user-1' } },
    farm_id: 'farm-1',
    fields: [], bins: [], plantRecords: [], sprayRecords: [], harvestRecords: [],
    hayHarvestRecords: [], customSprayRecords: [], fertilizerApplications: [], grainMovements: [],
    savedSeeds: [], fertilizerRecipes: [], sprayRecipes: [], tillageRecords: [],
    fsaTracts: [], cluAssignments: [], workRequests: [],
    equipment: [], maintenanceSchedules: [], maintenanceLogs: [], activeSeason: 2025,
    setActiveSeason, setViewingSeason, setLoading: vi.fn(),
    setFields: vi.fn(), setBins: vi.fn(), setPlantRecords: vi.fn(), setSprayRecords: vi.fn(),
    setHarvestRecords: vi.fn(), setHayHarvestRecords: vi.fn(), setCustomSprayRecords: vi.fn(),
    setFertilizerApplications: vi.fn(), setGrainMovements: vi.fn(), setSavedSeeds: vi.fn(),
    setFertilizerRecipes: vi.fn(), setSprayRecipes: vi.fn(), setTillageRecords: vi.fn(),
    setFsaTracts: vi.fn(), setCluAssignments: vi.fn(), setWorkRequests: vi.fn(),
    setEquipment: vi.fn(), setMaintenanceSchedules: vi.fn(), setMaintenanceLogs: vi.fn(),
    setFarmId: vi.fn(),
    refetchFarmData: vi.fn().mockResolvedValue(true),
    isOnline: true, initialFetchComplete: true, fetchError: false, pendingSyncCount: 0,
    ...overrides,
  } as any;
}

describe('season rollover safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.reset();
    clearQueue.mockResolvedValue(undefined);
    offlineStore.unavailable = false;
  });

  it('requires exactly the next season before creating a backup', async () => {
    const args = makeArgs({ activeSeason: 2024 });
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
    expect(supabaseMock.fns.update).not.toHaveBeenCalled();
  });

  it('uses season CAS and refreshes a competing rollover without applying its target', async () => {
    const { toast } = await import('sonner');
    supabaseMock.setTablePages('profiles', [
      { error: null, count: 0 }, { data: { active_season: 2027 }, error: null },
    ]);
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(supabaseMock.fns.eq).toHaveBeenCalledWith('active_season', 2025);
    expect(supabaseMock.fns.eq).toHaveBeenCalledWith('farm_id', 'farm-1');
    expect(args.setActiveSeason).toHaveBeenCalledWith(2027);
    expect(args.setActiveSeason).not.toHaveBeenCalledWith(2026);
    expect(args.setViewingSeason.mock.calls[0][0](2025)).toBe(2027);
    expect(toast.error).toHaveBeenCalledWith('Season changed elsewhere');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each([2025, 2027])('plain cache clear reloads active season %s and retains valid viewing/storage', async (season) => {
    supabaseMock.setResult({ data: { active_season: season } });
    localStorage.setItem('user-1_al_viewing_season', '2024');
    localStorage.setItem('user-1_al_active_season', String(season));
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.clearLocalCache({ keepPendingSync: true })).resolves.toBe(true);
    expect(args.setActiveSeason).toHaveBeenCalledWith(season);
    expect(args.setViewingSeason.mock.calls[0][0](2024)).toBe(2024);
    expect(args.setViewingSeason.mock.calls[0][0](2000)).toBe(season);
    expect(localStorage.getItem('user-1_al_viewing_season')).toBe('2024');
    expect(clearQueue).not.toHaveBeenCalled();
    expect(args.refetchFarmData).toHaveBeenCalled();
    expect(args.setFarmId).not.toHaveBeenCalled();
  });

  it('clears the farm offline queue as part of local sign-out cleanup', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache()).resolves.toBe(true);

    expect(clearQueue).toHaveBeenCalledWith('farm-1');
  });

  it('fails closed without wiping local state when the offline queue cannot be cleared', async () => {
    clearQueue.mockRejectedValue(new Error('storage locked'));
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache()).resolves.toBe(false);

    expect(args.setFields).not.toHaveBeenCalled();
    expect(args.setFarmId).not.toHaveBeenCalled();
  });

  it('uses the offline-store warning when the queue cannot be cleared because SQLite will not open', async () => {
    const { toast } = await import('sonner');
    clearQueue.mockRejectedValue(new Error('Offline database unavailable.'));
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache()).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      'This phone cannot open its offline records. Stay signed in so unsynced work is not lost.',
    );
  });

  it('downloads a versioned backup before changing both seasons', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(true);
    expect(exportDataAsJson).toHaveBeenCalledWith(
      expect.objectContaining({ backupVersion: 2, activeSeason: 2025 }),
      expect.any(String),
    );
    expect(args.setActiveSeason).toHaveBeenCalledWith(2026);
    expect(args.setViewingSeason).toHaveBeenCalledWith(2026);
  });

  it('does not change local seasons when the cloud update affects zero rows', async () => {
    supabaseMock.setResult({ error: null, count: 0 });
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(args.setActiveSeason).not.toHaveBeenCalled();
    expect(args.setViewingSeason).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing on an unexpected network failure', async () => {
    supabaseMock.setThrow(new Error('network'));
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(args.setActiveSeason).not.toHaveBeenCalled();
  });

  it('blocks rollover while local changes are waiting to sync', async () => {
    const args = makeArgs({ pendingSyncCount: 1 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
  });

  it('allows confirmed sign-out cleanup when the unreadable store is skipped', async () => {
    offlineStore.unavailable = true;
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ skipUnreadableOfflineStore: true })).resolves.toBe(true);

    expect(clearQueue).not.toHaveBeenCalled();
    expect(args.setFields).toHaveBeenCalledWith([]);
    expect(args.setFarmId).toHaveBeenCalledWith(null);
  });

  it('still clears the queue when skip is requested but the store is readable', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ skipUnreadableOfflineStore: true })).resolves.toBe(true);

    expect(clearQueue).toHaveBeenCalledWith('farm-1');
  });

  it('blocks rollover when the phone offline store cannot be opened', async () => {
    const { toast } = await import('sonner');
    offlineStore.unavailable = true;
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'This phone cannot open its offline records. Stay signed in so unsynced work is not lost.',
    );
  });

  it('does not roll over when the generated backup fails schema validation', async () => {
    const args = makeArgs({ fields: [{}] });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
    expect(args.setActiveSeason).not.toHaveBeenCalled();
    expect(args.setViewingSeason).not.toHaveBeenCalled();
  });

  it('rejects a no-op or backwards rollover before creating a backup', async () => {
    const args = makeArgs({ activeSeason: 2026 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
  });
});
