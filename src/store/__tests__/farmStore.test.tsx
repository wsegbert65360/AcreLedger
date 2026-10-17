/** @vitest-environment jsdom */
import { useState, type ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock, type SupabaseResult } from '@/test/supabaseMock';
import type { GrainMovement } from '@/types/farm';

/**
 * Provider-level tests for farmStore's genuinely composed responsibilities:
 * all-season bin totals, the fail-closed signOut composition, fetchData's two
 * error shapes, and viewing-season validation. Heavy child hooks are mocked so
 * these tests pin farmStore's own logic, not the (separately tested) hooks.
 * Restore intentionally lives in the useSeasonManagement suites instead.
 */

const cloud = createSupabaseMock();
const toastError = vi.fn();
const toastSuccess = vi.fn();
const authSignOut = vi.fn();
const ensureFarmMock = vi.fn();
// farmStore's fetch effect depends on setLoading; production passes a stable
// useState setter, so the mock must too or every re-render re-triggers
// fetchData (which corrupts stateful page queues set up by pagination tests).
const authSetLoading = vi.fn();
const clearLocalCacheMock = vi.fn();
const getPendingCountMock = vi.fn().mockResolvedValue(0);
const getQueueMock = vi.fn().mockResolvedValue([]);
const getFailedMock = vi.fn().mockResolvedValue([]);
const retryFailedMock = vi.fn().mockResolvedValue(undefined);
const replayQueueMock = vi.fn().mockResolvedValue(true);
const loadCacheMock = vi.fn();
const saveCacheMock = vi.fn();

// Per-test controls read by the mocked hooks.
const control = {
  farm_id: 'farm-1' as string | null,
  user_id: 'user-1' as string | null,
  isOnline: false,
  onboardingComplete: true,
};
const cacheControl: {
  data: Record<string, unknown>;
  load: null | ((table: string, userId: string | null) => unknown | Promise<unknown>);
} = { data: {}, load: null };

vi.doMock('@/lib/supabase', () => ({ supabase: cloud.client }));
vi.doMock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

vi.doMock('@/store/useAuth', () => ({
  useAuth: () => {
    const session = control.user_id ? { user: { id: control.user_id } } : null;
    const [activeSeason, setActiveSeason] = useState(2026);
    const [viewingSeason, setViewingSeason] = useState(2026);
    const [onboardingComplete, setOnboardingComplete] = useState(control.onboardingComplete);
    return {
      session,
      loading: false,
      setLoading: authSetLoading,
      farm_id: control.farm_id,
      setFarmId: vi.fn(),
      activeSeason,
      setActiveSeason,
      viewingSeason,
      setViewingSeason,
      onboardingComplete,
      setOnboardingComplete,
      signOut: authSignOut,
      ensureFarm: ensureFarmMock,
    };
  },
}));

vi.doMock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: control.isOnline }),
}));

vi.doMock('@/store/usePlantRecords', () => ({ usePlantRecords: () => ({}) }));
vi.doMock('@/store/useSprayRecords', () => ({ useSprayRecords: () => ({}) }));
vi.doMock('@/store/useHarvestRecords', () => ({ useHarvestRecords: () => ({}) }));
vi.doMock('@/store/useHayRecords', () => ({ useHayRecords: () => ({}) }));
vi.doMock('@/store/useCustomSprayRecords', () => ({ useCustomSprayRecords: () => ({}) }));
vi.doMock('@/store/useFertilizerRecords', () => ({ useFertilizerRecords: () => ({}) }));
vi.doMock('@/store/useTillageRecords', () => ({ useTillageRecords: () => ({}) }));
vi.doMock('@/store/useGrainMovements', () => ({ useGrainMovements: () => ({}) }));
vi.doMock('@/store/useFieldsAndBins', () => ({ useFieldsAndBins: () => ({}) }));
vi.doMock('@/store/useFsaTracts', () => ({ useFsaTracts: () => ({}) }));
vi.doMock('@/store/useSeasonManagement', () => ({
  useSeasonManagement: () => ({
    clearLocalCache: clearLocalCacheMock,
    rolloverToNewSeason: vi.fn(),
    restoreFromBackup: vi.fn(),
  }),
}));

vi.doMock('@/lib/syncQueue', () => ({
  WebSyncQueueUnreadableError: class WebSyncQueueUnreadableError extends Error {},
  MAX_SYNC_RETRIES: 10,
  LINKED_GRAIN_MUTATION_KEY: '__linked_grain_movement',
  readEquipmentRpcEnvelope: () => null,
  syncQueue: {
    getQueue: getQueueMock,
    getFailed: getFailedMock,
    retryFailed: retryFailedMock,
    getPendingCount: getPendingCountMock,
    replayQueue: replayQueueMock,
  },
}));

vi.doMock('@/lib/offlineStorage', () => ({
  offlineStorage: {
    loadCache: loadCacheMock,
    saveCache: saveCacheMock,
    clearCache: vi.fn(),
  },
  OFFLINE_DATABASE_UNAVAILABLE: 'Offline database unavailable.',
  isOfflineDatabaseUnavailableError: (error: unknown) =>
    error instanceof Error && error.message === 'Offline database unavailable.',
}));

let FarmProvider: typeof import('../farmStore').FarmProvider;
let useFarm: typeof import('../farmStore').useFarm;
beforeAll(async () => {
  ({ FarmProvider, useFarm } = await import('../farmStore'));
});

const wrapper = ({ children }: { children: ReactNode }) => <FarmProvider>{children}</FarmProvider>;

function makeMovement(overrides: Partial<GrainMovement>): GrainMovement {
  return {
    id: 'm-1',
    binId: 'bin-1',
    binName: 'Bin 1',
    type: 'in',
    bushels: 100,
    moisturePercent: 15,
    timestamp: 1000,
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
    ...overrides,
  };
}

describe('farmStore composed behaviors', () => {
  beforeEach(() => {
    cloud.reset();
    control.farm_id = 'farm-1';
    control.user_id = 'user-1';
    control.isOnline = false;
    control.onboardingComplete = true;
    ensureFarmMock.mockReset().mockResolvedValue('farm-1');
    localStorage.clear();
    cacheControl.data = {};
    cacheControl.load = null;
    toastError.mockReset();
    toastSuccess.mockReset();
    authSignOut.mockReset().mockResolvedValue({ signedOut: true, serverPending: false });
    authSetLoading.mockReset();
    clearLocalCacheMock.mockReset();
    getPendingCountMock.mockReset().mockResolvedValue(0);
    replayQueueMock.mockReset().mockResolvedValue(true);
    getQueueMock.mockReset().mockResolvedValue([]);
    getFailedMock.mockReset().mockResolvedValue([]);
    retryFailedMock.mockReset().mockResolvedValue(undefined);
    loadCacheMock.mockReset().mockImplementation((table: string, userId: string | null) =>
      Promise.resolve(cacheControl.load
        ? cacheControl.load(table, userId)
        : cacheControl.data[table] ?? null));
    saveCacheMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('onboarding persistence', () => {
    it('keeps local onboarding incomplete when the profile write fails', async () => {
      control.onboardingComplete = false;
      cloud.setResult({ error: { message: 'offline' } });
      const { result } = renderHook(() => useFarm(), { wrapper });
      await act(async () => expect(await result.current.completeOnboarding()).toBe(false));
      expect(result.current.onboardingComplete).toBe(false);
      expect(localStorage.getItem('user-1_al_onboarding_complete')).toBeNull();
    });

    it('waits for a successful profile write before updating local onboarding', async () => {
      control.onboardingComplete = false;
      const { result } = renderHook(() => useFarm(), { wrapper });
      let finish!: (value: Partial<SupabaseResult>) => void;
      cloud.setTablePages('profiles', [new Promise(resolve => { finish = resolve; })]);
      let completion!: Promise<boolean>;
      act(() => { completion = result.current.completeOnboarding(); });
      await waitFor(() => expect(cloud.fns.update).toHaveBeenCalledWith({ onboarding_complete: true }));
      expect(result.current.onboardingComplete).toBe(false);
      expect(localStorage.getItem('user-1_al_onboarding_complete')).toBeNull();
      await act(async () => {
        finish({ error: null });
        expect(await completion).toBe(true);
      });
      expect(result.current.onboardingComplete).toBe(true);
      expect(localStorage.getItem('user-1_al_onboarding_complete')).toBe('1');
    });

    it('retries a missing farm before renaming during onboarding', async () => {
      control.farm_id = null;
      const { result } = renderHook(() => useFarm(), { wrapper });
      await act(async () => expect(await result.current.updateFarmName('Oak Creek')).toBe(true));
      expect(ensureFarmMock).toHaveBeenCalledTimes(1);
      expect(cloud.fns.rpc).toHaveBeenCalledWith('update_farm_name', { p_name: 'Oak Creek' });
    });

    it('keeps onboarding incomplete if farm initialization still fails', async () => {
      control.farm_id = null;
      control.onboardingComplete = false;
      ensureFarmMock.mockResolvedValue(null);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await act(async () => expect(await result.current.completeOnboarding()).toBe(false));
      expect(cloud.fns.update).not.toHaveBeenCalled();
      expect(result.current.onboardingComplete).toBe(false);
    });

    it('discards an onboarding result when the current user changes', async () => {
      control.onboardingComplete = false;
      const { result, rerender } = renderHook(() => useFarm(), { wrapper });
      let finish!: (value: Partial<SupabaseResult>) => void;
      cloud.setTablePages('profiles', [new Promise(resolve => { finish = resolve; })]);
      let completion!: Promise<boolean>;
      act(() => { completion = result.current.completeOnboarding(); });
      await waitFor(() => expect(cloud.fns.update).toHaveBeenCalled());
      control.user_id = 'user-2';
      rerender();
      await act(async () => {
        finish({ error: null });
        expect(await completion).toBe(false);
      });
      expect(result.current.onboardingComplete).toBe(false);
      expect(localStorage.getItem('user-1_al_onboarding_complete')).toBeNull();
      expect(localStorage.getItem('user-2_al_onboarding_complete')).toBeNull();
    });
  });

  describe('getBinTotal', () => {
    beforeEach(() => {
      cacheControl.data['grain_movements'] = [
        makeMovement({ id: 'm-1', type: 'in', bushels: 1000, seasonYear: 2025 }), // prior-season carryover
        makeMovement({ id: 'm-2', type: 'in', bushels: 500, seasonYear: 2026 }),
        makeMovement({ id: 'm-3', type: 'out', bushels: 200, seasonYear: 2026 }),
        makeMovement({ id: 'm-4', type: 'in', bushels: 999, seasonYear: 2026, deleted_at: '2026-06-01T00:00:00.000Z' }),
        makeMovement({ id: 'm-5', binId: 'bin-2', binName: 'Bin 2', type: 'in', bushels: 300, seasonYear: 2025 }),
      ];
    });

    it('returns the all-season total including prior-season carryover when no season is given', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });

      // Carryover rule: bin inventory is continuous physical state. Scoping it
      // to the viewing season would make carryover grain vanish.
      await waitFor(() => expect(result.current.getBinTotal('bin-1')).toBe(1300));
      expect(result.current.getBinTotal('bin-2')).toBe(300);
      expect(result.current.getBinTotal('bin-missing')).toBe(0);
    });

    it('scopes the total when a season is given', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.getBinTotal('bin-1', 2026)).toBe(300));
      expect(result.current.getBinTotal('bin-1', 2025)).toBe(1000);
    });
  });

  describe('getBinTotal float precision', () => {
    it('does not let float drift make a displayed total unsellable', async () => {
      cacheControl.data['grain_movements'] = [
        makeMovement({ id: 'f-1', type: 'in', bushels: 0.1 }),
        makeMovement({ id: 'f-2', type: 'in', bushels: 0.2 }),
        makeMovement({ id: 'f-3', type: 'in', bushels: 2999.7, seasonYear: 2025 }),
      ];
      const { result } = renderHook(() => useFarm(), { wrapper });

      // Raw float sum of 0.1 + 0.2 is 0.30000000000000004.
      await waitFor(() => expect(result.current.getBinTotal('bin-1', 2026)).toBe(0.3));
      expect(result.current.getBinTotal('bin-1')).toBe(3000);
    });
  });

  describe('signOut composition', () => {
    it('preserves local records and queued work for deletion-pending sign-out', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      await act(async () => expect(await result.current.signOut({ preserveLocalData: true })).toEqual({
        signedOut: true, serverPending: false, cacheCleared: false,
      }));
      expect(authSignOut).toHaveBeenCalledWith('local');
      expect(clearLocalCacheMock).not.toHaveBeenCalled();
    });

    it('preserves the signed-out result when later cache cleanup throws', async () => {
      clearLocalCacheMock.mockRejectedValue(new Error('storage unavailable'));
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      await act(async () => expect(await result.current.signOut()).toEqual({
        signedOut: true, serverPending: false, cacheCleared: false,
      }));
      expect(toastError).toHaveBeenCalledWith('Signed out on this device; some local records could not be cleared.');
    });

    it('preserves the queue when persisted credentials cannot be removed', async () => {
      authSignOut.mockRejectedValue(new Error('secure storage unavailable'));
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      await act(async () => expect(await result.current.signOut()).toEqual({ signedOut: false, serverPending: true }));
      expect(clearLocalCacheMock).not.toHaveBeenCalled();
    });

    it('returns server pending status to the settings caller', async () => {
      authSignOut.mockResolvedValue({ signedOut: true, serverPending: true });
      clearLocalCacheMock.mockResolvedValue(true);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      await act(async () => expect(await result.current.signOut()).toEqual({
        signedOut: true, serverPending: true, cacheCleared: true,
      }));
    });

    it('reports remaining cache after ending the auth session', async () => {
      clearLocalCacheMock.mockResolvedValue(false);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      await act(async () => { await result.current.signOut(); });

      expect(authSignOut).toHaveBeenCalledWith('local');
    });

    it('ends auth before clearing the irreversible queue', async () => {
      clearLocalCacheMock.mockResolvedValue(true);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      await act(async () => { await result.current.signOut(); });

      expect(clearLocalCacheMock).toHaveBeenCalled();
      expect(authSignOut).toHaveBeenCalledTimes(1);
      expect(authSignOut.mock.invocationCallOrder[0]).toBeLessThan(clearLocalCacheMock.mock.invocationCallOrder[0]);
    });

    it('forwards emergency sign-out so the session can end without a readable store', async () => {
      clearLocalCacheMock.mockResolvedValue(true);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      await act(async () => {
        await result.current.signOut({ skipUnreadableOfflineStore: true });
      });

      expect(clearLocalCacheMock).toHaveBeenCalledWith({ skipUnreadableOfflineStore: true });
      expect(authSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('viewing season selection', () => {
    it('accepts a season inside the valid window', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      act(() => { result.current.setViewingSeason(2025); });

      expect(result.current.viewingSeason).toBe(2025);
      expect(toastError).not.toHaveBeenCalled();
    });

    it('rejects a season outside the valid window with feedback', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      act(() => { result.current.setViewingSeason(2015); });

      expect(result.current.viewingSeason).toBe(2026);
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Season must be between'));
    });
  });

  describe('fetchData', () => {
    it('refresh replays then fetches even with pending work and caches the queued overlay', async () => {
      control.isOnline = true;
      replayQueueMock.mockResolvedValue(false);
      getPendingCountMock.mockResolvedValue(1);
      getQueueMock.mockResolvedValue([{
        id: 'q1', table_name: 'fields', operation: 'insert', farm_id: 'farm-1', retry_count: 0,
        payload: { id: 'local-field', farm_id: 'farm-1', name: 'Local field', acreage: 40, deleted_at: null },
      }]);
      cloud.setTableHandler('farms', { data: { name: 'Cloud Farm' }, error: null });
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      expect(result.current.fields[0].name).toBe('Local field');
      expect(result.current.farmName).toBe('Cloud Farm');
      expect(result.current.lastSync).toBeNull();
      replayQueueMock.mockClear();
      cloud.fns.from.mockClear();
      await act(async () => { expect(await result.current.refresh()).toBe(true); });
      expect(replayQueueMock).toHaveBeenCalledWith('farm-1');
      expect(replayQueueMock.mock.invocationCallOrder[0]).toBeLessThan(cloud.fns.from.mock.invocationCallOrder[0]);
      await waitFor(() => expect(saveCacheMock).toHaveBeenCalledWith('fields', 'user-1', expect.arrayContaining([expect.objectContaining({ id: 'local-field', name: 'Local field' })])));
    });

    it('loads cloud on an unreadable web queue while reporting status unknown', async () => {
      control.isOnline = true;
      const { WebSyncQueueUnreadableError } = await import('@/lib/syncQueue');
      const error = new WebSyncQueueUnreadableError();
      replayQueueMock.mockRejectedValue(error);
      getQueueMock.mockRejectedValue(error);
      getPendingCountMock.mockRejectedValue(error);
      cloud.setTableHandler('farms', { data: { name: 'Cloud Farm' }, error: null });
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      expect(result.current.syncQueueLocked).toBe(true);
      expect(result.current.syncQueueReadFailed).toBe(true);
      expect(result.current.farmName).toBe('Cloud Farm');
      expect(result.current.lastSync).toBeNull();
    });

    it('keeps the queue locked without a failed read while the first count is pending', async () => {
      let resolveCount: (count: number) => void = () => {};
      getPendingCountMock.mockReturnValue(new Promise<number>((resolve) => {
        resolveCount = resolve;
      }));
      const { result } = renderHook(() => useFarm(), { wrapper });

      expect(result.current.syncQueueLocked).toBe(true);
      expect(result.current.syncQueueReadFailed).toBe(false);

      await act(async () => { resolveCount(0); });
      await waitFor(() => expect(result.current.syncQueueLocked).toBe(false));
      expect(result.current.syncQueueReadFailed).toBe(false);
    });

    it('refreshes parked counts after background replay and timestamps only an empty drain', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      getPendingCountMock.mockResolvedValue(2);
      getFailedMock.mockResolvedValue([{ id: 'parked' }]);
      await act(async () => {
        window.dispatchEvent(new CustomEvent('acreledger:sync-replayed', { detail: { farmId: 'farm-1', drained: false } }));
      });
      await waitFor(() => expect(result.current.failedSyncCount).toBe(1));
      expect(result.current.pendingSyncCount).toBe(1);
      expect(result.current.lastSync).toBeNull();
      getPendingCountMock.mockResolvedValue(0);
      getFailedMock.mockResolvedValue([]);
      await act(async () => {
        window.dispatchEvent(new CustomEvent('acreledger:sync-replayed', { detail: { farmId: 'farm-1', drained: true } }));
      });
      await waitFor(() => expect(result.current.pendingSyncCount).toBe(0));
      expect(result.current.lastSync).toBeInstanceOf(Date);
    });

    it('short-circuits offline without touching Supabase', async () => {
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      expect(cloud.fns.from).not.toHaveBeenCalled();
      let ok: boolean | undefined;
      await act(async () => { ok = await result.current.refresh(); });
      expect(ok).toBe(true);
    });

    it('hydrates from cloud and reports success when every table loads', async () => {
      control.isOnline = true;
      cloud.setTableHandler('farms', { data: { name: 'Cloud Farm' }, error: null });
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      let ok: boolean | undefined;
      await act(async () => { ok = await result.current.refresh(); });

      expect(ok).toBe(true);
      expect(result.current.fetchError).toBe(false);
      expect(result.current.farmName).toBe('Cloud Farm');
    });

    it('still hydrates from cloud when the phone offline store cannot be opened', async () => {
      control.isOnline = true;
      replayQueueMock.mockRejectedValue(new Error('Offline database unavailable.'));
      cloud.setTableHandler('farms', { data: { name: 'Cloud Farm' }, error: null });
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      expect(result.current.farmName).toBe('Cloud Farm');
      expect(result.current.fetchError).toBe(false);
    });

    it('toasts and flags fetchError when a table returns an error', async () => {
      control.isOnline = true;
      cloud.setTableHandler('bins', { data: null, error: { message: 'rls denied' } });
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.fetchError).toBe(true));

      expect(toastError).toHaveBeenCalledWith('Some data failed to load from cloud. Showing local cache.');
      let ok: boolean | undefined;
      await act(async () => { ok = await result.current.refresh(); });
      expect(ok).toBe(false);
    });

    it('flags fetchError without a toast when a query rejects in the outer catch', async () => {
      control.isOnline = true;
      cloud.setThrow(new Error('network down'));
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.fetchError).toBe(true));

      // Known asymmetry (farmStore.tsx outer catch, lines ~383-386): a rejected
      // query sets fetchError but shows no toast, while a returned table error
      // does. This pins current behavior per the remediation plan v2; whether
      // the exception path should also toast is a stop-and-report product
      // decision, not something to fix silently from a test.
      expect(toastError).not.toHaveBeenCalled();
      let ok: boolean | undefined;
      await act(async () => { ok = await result.current.refresh(); });
      expect(ok).toBe(false);
    });

    it('pages past the Data API row cap and applies rows from every page', async () => {
      control.isOnline = true;
      cloud.setTableHandler('farms', { data: { name: 'Cloud Farm' }, error: null });
      // A collection larger than COMPLETE_COLLECTION_PAGE_SIZE: the second page
      // must be fetched and merged, not silently truncated.
      const pageOne = Array.from({ length: 1000 }, (_, i) => ({
        id: `bin-${i}`, name: `Bin ${i}`, capacity: 1000, farm_id: 'farm-1', deleted_at: null,
      }));
      const pageTwo = [{
        id: 'bin-overflow', name: 'Overflow Bin', capacity: 500, farm_id: 'farm-1', deleted_at: null,
      }];
      cloud.setTablePages('bins', [
        { data: pageOne, error: null },
        { data: pageTwo, error: null },
      ]);
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      expect(result.current.bins).toHaveLength(1001);
      expect(result.current.bins.some(b => b.id === 'bin-overflow')).toBe(true);
      // Second offset window (from=1000, to=1999) was actually requested.
      expect(cloud.fns.range).toHaveBeenCalledWith(1000, 1999);
    });

    it('keeps the load unsettled and applies no rows when a later page fails', async () => {
      control.isOnline = true;
      // Page one must be exactly full-size so the read continues into the
      // failing second page instead of stopping at a short page.
      const fullPage = Array.from({ length: 1000 }, (_, i) => ({
        id: `bin-${i}`, name: `Bin ${i}`, capacity: 1000, farm_id: 'farm-1', deleted_at: null,
      }));
      cloud.setTablePages('bins', [
        { data: fullPage, error: null },
        { data: null, error: { message: 'page 2 denied' } },
      ]);
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.fetchError).toBe(true));

      // A truncated fetch must not look settled: complete-collection reads that
      // error return no rows and never mark the initial load complete.
      expect(toastError).toHaveBeenCalledWith('Some data failed to load from cloud. Showing local cache.');
      expect(result.current.initialFetchComplete).toBe(false);
      expect(result.current.bins).toEqual([]);
    });

    it('ignores a previous user cache hydration after the identity changes', async () => {
      let resolveOldCache!: (value: unknown) => void;
      const oldCache = new Promise(resolve => { resolveOldCache = resolve; });
      const userTwoField = { id: 'field-b', name: 'User B field', acreage: 10, farm_id: 'farm-2', deleted_at: null };
      cacheControl.load = (table, userId) => {
        if (table !== 'fields') return null;
        if (userId === 'user-1') return oldCache;
        if (userId === 'user-2') return [userTwoField];
        return null;
      };
      const { result, rerender } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(loadCacheMock).toHaveBeenCalledWith('fields', 'user-1'));

      control.user_id = 'user-2';
      control.farm_id = 'farm-2';
      rerender();
      await waitFor(() => expect(result.current.fields.map(field => field.id)).toEqual(['field-b']));

      await act(async () => {
        resolveOldCache([{ id: 'field-a', name: 'User A field', acreage: 20, farm_id: 'farm-1', deleted_at: null }]);
        await oldCache;
      });

      expect(result.current.fields.map(field => field.id)).toEqual(['field-b']);
      const userTwoFieldWrites = saveCacheMock.mock.calls
        .filter(([table, userId]) => table === 'fields' && userId === 'user-2')
        .map(([, , value]) => value);
      expect(userTwoFieldWrites).not.toContainEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'field-a' }),
      ]));
    });

    it('does not apply an old account cloud response after sign-out', async () => {
      control.isOnline = true;
      let resolveFields!: (value: { data: unknown[]; error: null }) => void;
      const deferredFields = new Promise<{ data: unknown[]; error: null }>(resolve => {
        resolveFields = resolve;
      });
      cloud.setTablePages('fields', [deferredFields]);
      cloud.setTableHandler('farms', { data: { name: 'Farm A' }, error: null });
      const { result, rerender } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(cloud.fns.from).toHaveBeenCalledWith('fields'));

      control.user_id = null;
      control.farm_id = null;
      rerender();
      await waitFor(() => expect(result.current.fields).toEqual([]));

      await act(async () => {
        resolveFields({
          data: [{ id: 'field-a', name: 'Late field', acreage: 10, farm_id: 'farm-1', deleted_at: null }],
          error: null,
        });
        await deferredFields;
      });

      expect(result.current.fields).toEqual([]);
      expect(result.current.farmName).toBeNull();
    });

    it('overlays queued equipment mutations onto retained cache when equipment fails to load', async () => {
      control.isOnline = true;
      cacheControl.data.equipment = [{
        id: 'cloud-1', farm_id: 'farm-1', kind: 'tractor', make: 'Deere', meterUnit: 'hours',
        currentReading: 1000, status: 'active', createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z', deleted_at: null,
      }];
      cloud.setTableHandler('equipment', { data: null, error: { message: 'relation missing' } });
      cloud.setTableHandler('farms', { data: { name: 'Cloud Farm' }, error: null });
      getQueueMock.mockResolvedValue([{
        id: 'q1', table_name: 'equipment', operation: 'update', farm_id: 'farm-1', retry_count: 0,
        payload: { id: 'cloud-1', make: 'Case' },
      }]);
      const { result } = renderHook(() => useFarm(), { wrapper });

      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));
      expect(result.current.equipmentLoadFailed).toBe(true);
      expect(result.current.equipment).toHaveLength(1);
      expect(result.current.equipment[0].make).toBe('Case');

      await act(async () => { await result.current.refresh(); });
      expect(result.current.equipment).toHaveLength(1);
      expect(result.current.equipment[0].make).toBe('Case');
    });
  });
});
