/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSeasonManagement } from '@/store/useSeasonManagement';

/**
 * Focused regression tests for the High data-loss finding: "Clear Local Cache"
 * must never discard unsynced offline work, must not touch the encrypted sync
 * queue (or its quarantine copy) for a plain cache clear, and must not unset
 * farm_id on a still-authenticated session.
 */

const clearQueue = vi.hoisted(() => vi.fn());
const getPendingCount = vi.hoisted(() => vi.fn());
const replayQueue = vi.hoisted(() => vi.fn());
const offlineStore = vi.hoisted(() => ({ unavailable: false }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/utils/backup', () => ({ exportDataAsJson: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/syncQueue', () => ({
  syncQueue: {
    clearQueue,
    getPendingCount,
    replayQueue,
    // Mirror the real module's exported queue key names so the guard in
    // useSeasonManagement's selectCacheKeysToRemove can exclude them.
    SYNC_QUEUE_KEY: 'al_sync_queue',
    CORRUPT_QUEUE_KEY: 'al_sync_queue_corrupt',
  },
}));
vi.mock('@/lib/offlineStorage', () => ({
  offlineStorage: { clearCache: vi.fn().mockResolvedValue(undefined) },
  isNativeOfflineStoreUnavailable: () => offlineStore.unavailable,
  isOfflineDatabaseUnavailableError: (error: unknown) =>
    error instanceof Error && error.message === 'Offline database unavailable.',
  OFFLINE_DATABASE_UNAVAILABLE: 'Offline database unavailable.',
  OFFLINE_STORE_UNAVAILABLE_MESSAGE: 'This phone cannot open its offline records.',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'user-1' } },
    farm_id: 'farm-1',
    fields: [], bins: [], plantRecords: [], sprayRecords: [], harvestRecords: [],
    hayHarvestRecords: [], customSprayRecords: [], fertilizerApplications: [], grainMovements: [],
    savedSeeds: [], fertilizerRecipes: [], sprayRecipes: [], tillageRecords: [],
    fsaTracts: [], cluAssignments: [], workRequests: [], activeSeason: 2025,
    setActiveSeason: vi.fn(), setViewingSeason: vi.fn(), setLoading: vi.fn(),
    setFields: vi.fn(), setBins: vi.fn(), setPlantRecords: vi.fn(), setSprayRecords: vi.fn(),
    setHarvestRecords: vi.fn(), setHayHarvestRecords: vi.fn(), setCustomSprayRecords: vi.fn(),
    setFertilizerApplications: vi.fn(), setGrainMovements: vi.fn(), setSavedSeeds: vi.fn(),
    setFertilizerRecipes: vi.fn(), setSprayRecipes: vi.fn(), setTillageRecords: vi.fn(),
    setFsaTracts: vi.fn(), setCluAssignments: vi.fn(), setWorkRequests: vi.fn(), setFarmId: vi.fn(),
    refetchFarmData: vi.fn().mockResolvedValue(true),
    isOnline: true, initialFetchComplete: true, fetchError: false, pendingSyncCount: 0,
    ...overrides,
  } as any;
}

describe('clearLocalCache — unsynced work protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offlineStore.unavailable = false;
    clearQueue.mockResolvedValue(undefined);
    getPendingCount.mockResolvedValue(0);
    replayQueue.mockResolvedValue(true);
  });

  it('plain cache clear never touches the sync queue', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ keepPendingSync: true })).resolves.toBe(true);

    expect(clearQueue).not.toHaveBeenCalled();
    expect(args.setFields).toHaveBeenCalledWith([]);
  });

  it('refuses the clear when pending offline work cannot be drained', async () => {
    getPendingCount.mockResolvedValue(3);
    const { toast } = await import('sonner');
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ keepPendingSync: true })).resolves.toBe(false);

    // Attempted a drain, then refused because items remain.
    expect(replayQueue).toHaveBeenCalledWith('farm-1');
    // Nothing was cleared and farm scope was preserved.
    expect(args.setFields).not.toHaveBeenCalled();
    expect(args.setFarmId).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Unsynced offline work is still pending.',
      expect.objectContaining({ description: expect.stringContaining('3 changes') }),
    );
  });

  it('proceeds after a successful drain leaves the queue empty', async () => {
    getPendingCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ keepPendingSync: true })).resolves.toBe(true);

    expect(replayQueue).toHaveBeenCalledWith('farm-1');
    expect(args.setFields).toHaveBeenCalledWith([]);
  });

  it('never removes the sync queue or its quarantine copy from localStorage on clear', async () => {
    localStorage.setItem('al_sync_queue', 'encrypted-queue-blob');
    localStorage.setItem('al_sync_queue_corrupt', 'quarantined-blob');
    localStorage.setItem('al_fields', 'cached-fields');
    localStorage.setItem('user-2_al_sync_queue', 'another-users-queue');
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ keepPendingSync: true })).resolves.toBe(true);

    expect(localStorage.getItem('al_sync_queue')).toBe('encrypted-queue-blob');
    expect(localStorage.getItem('al_sync_queue_corrupt')).toBe('quarantined-blob');
    expect(localStorage.getItem('al_fields')).toBeNull();
  });

  it('does not unset farm_id on a still-authenticated session (keeps scope)', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache({ keepPendingSync: true })).resolves.toBe(true);

    expect(args.setFarmId).not.toHaveBeenCalledWith(null);
    // Scope is re-derived from the cloud rather than blanked.
    expect(args.refetchFarmData).toHaveBeenCalled();
  });

  it('confirmed sign-out still clears the current farm queue and unsets scope', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.clearLocalCache()).resolves.toBe(true);

    expect(clearQueue).toHaveBeenCalledWith('farm-1');
    expect(args.setFarmId).toHaveBeenCalledWith(null);
  });
});
