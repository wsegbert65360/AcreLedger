/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';
let useSeasonManagement: typeof import('../useSeasonManagement')['useSeasonManagement'];
let formatRestoreFailure: typeof import('../useSeasonManagement')['formatRestoreFailure'];
const supabaseMock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
beforeAll(async () => {
  ({ useSeasonManagement, formatRestoreFailure } = await import('../useSeasonManagement'));
});
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
    localStorage.clear();
    clearQueue.mockResolvedValue(undefined);
    offlineStore.unavailable = false;
  });

  it('requires exactly the next season before creating a backup', async () => {
    const args = makeArgs({ activeSeason: 2024 });
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
    expect(supabaseMock.fns.update).not.toHaveBeenCalled();
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalled();
  });

  it('uses season CAS and refreshes a competing rollover without keeping its target', async () => {
    const { toast } = await import('sonner');
    supabaseMock.setRpcResult({
      data: null,
      error: { message: 'Active season changed elsewhere', code: '22023' },
    });
    supabaseMock.setTablePages('profiles', [
      { data: { active_season: 2027 }, error: null },
    ]);
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(supabaseMock.fns.rpc).toHaveBeenCalledWith('start_pre_season_reset', {
      p_from_season: 2025,
      p_to_season: 2026,
    });
    expect(supabaseMock.fns.update).not.toHaveBeenCalled();
    expect(supabaseMock.fns.eq).toHaveBeenCalledWith('farm_id', 'farm-1');
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(1, 2026);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(2, 2025);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(3, 2027);
    const viewingUpdater = args.setViewingSeason.mock.calls.find((call: unknown[]) => typeof call[0] === 'function')?.[0];
    expect(viewingUpdater(2025)).toBe(2027);
    expect(toast.error).toHaveBeenCalledWith('Season changed elsewhere');
    expect(toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem('user-1_farm-1_al_pre_season_snapshot')).toBeNull();
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
    const snapshotId = '11111111-1111-4111-8111-111111111111';
    supabaseMock.setRpcResult({ data: snapshotId, error: null });
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(true);
    expect(exportDataAsJson).toHaveBeenCalledWith(
      expect.objectContaining({ backupVersion: 3, activeSeason: 2025 }),
      expect.any(String),
    );
    expect(supabaseMock.fns.rpc).toHaveBeenCalledWith('start_pre_season_reset', {
      p_from_season: 2025,
      p_to_season: 2026,
    });
    expect(supabaseMock.fns.update).not.toHaveBeenCalled();
    const downloadOrder = vi.mocked(exportDataAsJson).mock.invocationCallOrder[0];
    const rpcOrder = supabaseMock.fns.rpc.mock.invocationCallOrder[0];
    expect(downloadOrder).toBeLessThan(rpcOrder);
    expect(args.setActiveSeason).toHaveBeenCalledWith(2026);
    expect(args.setViewingSeason).toHaveBeenCalledWith(2026);
    expect(localStorage.getItem('user-1_farm-1_al_pre_season_snapshot')).toContain(snapshotId);
  });

  it('does not change the season when the backup file is not downloaded', async () => {
    vi.mocked(exportDataAsJson).mockResolvedValueOnce(false);
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalled();
    expect(args.setActiveSeason).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic season when the cloud update fails', async () => {
    const { toast } = await import('sonner');
    supabaseMock.setRpcResult({ data: null, error: { message: 'permission denied' } });
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(1, 2026);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(2, 2025);
    expect(args.setViewingSeason).toHaveBeenNthCalledWith(1, 2026);
    expect(args.setViewingSeason).toHaveBeenNthCalledWith(2, 2025);
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to save new season to cloud. Season was NOT changed; your backup was downloaded.',
    );
  });

  it('returns false instead of throwing on an unexpected network failure', async () => {
    supabaseMock.setRpcThrow(new Error('network'));
    const args = makeArgs({ viewingSeason: 2024 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(1, 2026);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(2, 2025);
    expect(args.setViewingSeason).toHaveBeenNthCalledWith(1, 2026);
    expect(args.setViewingSeason).toHaveBeenNthCalledWith(2, 2024);
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

const restoreBackup = {
  backupVersion: 2,
  fields: [{ id: 'f1', name: 'North', farm_id: 'farm-1', acreage: 80, deleted_at: null }],
  sprayRecords: [{ id: 's1', fieldId: 'f1', fieldName: 'North', seasonYear: 2024, farm_id: 'farm-1', deleted_at: null }],
  activeSeason: 2024,
  backupDate: '2026-01-02T00:00:00.000Z',
};

describe('restore from backup gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.reset();
    supabaseMock.setTableHandler('fields', { data: [], error: null });
    supabaseMock.setRpcResult({ data: { grain_harvest_link_conflicts: 0 }, error: null });
  });

  it('blocks restore until cloud data has finished loading', async () => {
    const { toast } = await import('sonner');
    const args = makeArgs({ initialFetchComplete: false });
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.restoreFromBackup(restoreBackup)).resolves.toBe(false);
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Wait for cloud data and pending changes to finish syncing before restore.',
    );
  });

  it('blocks restore when fetch failed or pending sync remains', async () => {
    const fetchFailed = makeArgs({ fetchError: true });
    await expect(renderHook(() => useSeasonManagement(fetchFailed)).result.current.restoreFromBackup(restoreBackup))
      .resolves.toBe(false);
    const pending = makeArgs({ pendingSyncCount: 2 });
    await expect(renderHook(() => useSeasonManagement(pending)).result.current.restoreFromBackup(restoreBackup))
      .resolves.toBe(false);
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalled();
  });

  it('does not switch active season unless the user confirms', async () => {
    const args = makeArgs({ activeSeason: 2025 });
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.restoreFromBackup(restoreBackup)).resolves.toBe(true);
    expect(supabaseMock.fns.rpc).toHaveBeenCalledWith('restore_farm_backup', expect.objectContaining({
      p_active_season: null,
    }));
    const payload = supabaseMock.fns.rpc.mock.calls[0][1].p_payload as Record<string, unknown>;
    expect(payload._expected_active_season).toBeUndefined();
    expect(args.setActiveSeason).not.toHaveBeenCalled();
  });

  it('compare-and-sets the backup season only after explicit confirmation', async () => {
    const args = makeArgs({ activeSeason: 2025 });
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.restoreFromBackup(restoreBackup, { switchActiveSeason: true })).resolves.toBe(true);
    expect(supabaseMock.fns.rpc).toHaveBeenCalledWith('restore_farm_backup', expect.objectContaining({
      p_active_season: 2024,
    }));
    const payload = supabaseMock.fns.rpc.mock.calls[0][1].p_payload as Record<string, unknown>;
    expect(payload._expected_active_season).toBe(2025);
    expect(args.setActiveSeason).toHaveBeenCalledWith(2024);
  });

  it('surfaces the first Zod path and a generic message for other restore failures', async () => {
    const { ZodError } = await import('zod');
    const zod = formatRestoreFailure(new ZodError([{
      code: 'custom',
      path: ['sprayRecords', 0, 'waterRate'],
      message: 'Required',
    }]));
    expect(zod).toBe('sprayRecords.0.waterRate: Required');
    expect(formatRestoreFailure(new Error('cloud down'))).toBe('cloud down');
    expect(formatRestoreFailure('nope')).toBe('Unknown error during restore.');
  });

  it('rejects a backup made by a newer AcreLedger', async () => {
    const { toast } = await import('sonner');
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.restoreFromBackup({ ...restoreBackup, backupVersion: 99 })).resolves.toBe(false);
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Restore failed: This backup was made by a newer AcreLedger. Update the app before restoring it.',
    );
  });

  it('includes grain conflict counts in the success toast', async () => {
    const { toast } = await import('sonner');
    supabaseMock.setRpcResult({
      data: { grain_harvest_link_conflicts: 2, work_request_number_conflicts: 1 },
      error: null,
    });
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));
    await expect(result.current.restoreFromBackup(restoreBackup)).resolves.toBe(true);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('2 grain movements kept deleted'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1 work request kept deleted'));
  });
});

const snapshotId = '11111111-1111-4111-8111-111111111111';

describe('pre-season server undo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.reset();
    localStorage.clear();
    localStorage.setItem(
      'user-1_farm-1_al_pre_season_snapshot',
      JSON.stringify({ id: snapshotId, fromSeason: 2025, toSeason: 2026 }),
    );
  });

  it('undoes through undo_pre_season_reset and clears the device pointer', async () => {
    const { toast } = await import('sonner');
    supabaseMock.setRpcResult({ data: { active_season: 2025 }, error: null });
    const args = makeArgs({ activeSeason: 2026, viewingSeason: 2026 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.undoPreSeasonReset()).resolves.toBe(true);
    expect(args.setActiveSeason).toHaveBeenCalledWith(2025);
    expect(supabaseMock.fns.rpc).toHaveBeenCalledWith('undo_pre_season_reset', {
      p_snapshot_id: snapshotId,
    });
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalledWith('restore_farm_backup', expect.anything());
    expect(localStorage.getItem('user-1_farm-1_al_pre_season_snapshot')).toBeNull();
    expect(args.refetchFarmData).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Pre-season reset undone.');
  });

  it('rolls the season back and keeps the pointer when undo fails for a transient error', async () => {
    supabaseMock.setRpcResult({ data: null, error: { message: 'network down' } });
    const args = makeArgs({ activeSeason: 2026, viewingSeason: 2026 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.undoPreSeasonReset()).resolves.toBe(false);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(1, 2025);
    expect(args.setActiveSeason).toHaveBeenNthCalledWith(2, 2026);
    expect(localStorage.getItem('user-1_farm-1_al_pre_season_snapshot')).toContain(snapshotId);
  });

  it('clears the pointer when the snapshot can never be undone', async () => {
    supabaseMock.setRpcResult({
      data: null,
      error: { message: 'This pre-season reset was already undone.' },
    });
    const args = makeArgs({ activeSeason: 2026, viewingSeason: 2027 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.undoPreSeasonReset()).resolves.toBe(false);
    expect(args.setViewingSeason).toHaveBeenNthCalledWith(1, 2025);
    expect(args.setViewingSeason).toHaveBeenNthCalledWith(2, 2027);
    expect(localStorage.getItem('user-1_farm-1_al_pre_season_snapshot')).toBeNull();
  });

  it('does not roll the season back when the server undo succeeded but reload failed', async () => {
    const { toast } = await import('sonner');
    supabaseMock.setRpcResult({ data: { active_season: 2025 }, error: null });
    const args = makeArgs({
      activeSeason: 2026,
      viewingSeason: 2026,
      refetchFarmData: vi.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.undoPreSeasonReset()).resolves.toBe(false);
    expect(args.setActiveSeason.mock.calls.map((call: unknown[]) => call[0])).toEqual([2025, 2025]);
    expect(toast.error).toHaveBeenCalledWith(
      'The pre-season reset was undone, but reload failed. Refresh the page to sync your data.',
    );
  });

  it('does not call the server when this device has no snapshot', async () => {
    const { toast } = await import('sonner');
    localStorage.clear();
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.undoPreSeasonReset()).resolves.toBe(false);
    expect(supabaseMock.fns.rpc).not.toHaveBeenCalled();
    expect(args.setActiveSeason).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'No pre-season reset on this device can be undone. Upload the downloaded JSON file instead.',
    );
  });
});
