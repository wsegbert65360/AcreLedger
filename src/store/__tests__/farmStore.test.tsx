/** @vitest-environment jsdom */
import { useState, type ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabaseMock';
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
const clearLocalCacheMock = vi.fn();

// Per-test controls read by the mocked hooks.
const control = {
  farm_id: 'farm-1' as string | null,
  isOnline: false,
};
const cacheControl: { data: Record<string, unknown> } = { data: {} };

vi.doMock('@/lib/supabase', () => ({ supabase: cloud.client }));
vi.doMock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

vi.doMock('@/store/useAuth', () => ({
  useAuth: () => {
    // Session must be referentially stable: farmStore's hydration effect
    // depends on the session object, and a fresh object each render would loop.
    const [session] = useState(() => ({ user: { id: 'user-1' } }));
    const [activeSeason, setActiveSeason] = useState(2026);
    const [viewingSeason, setViewingSeason] = useState(2026);
    const [onboardingComplete, setOnboardingComplete] = useState(true);
    return {
      session,
      loading: false,
      setLoading: vi.fn(),
      farm_id: control.farm_id,
      setFarmId: vi.fn(),
      activeSeason,
      setActiveSeason,
      viewingSeason,
      setViewingSeason,
      onboardingComplete,
      setOnboardingComplete,
      signOut: authSignOut,
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
  syncQueue: {
    getPendingCount: vi.fn().mockResolvedValue(0),
    replayQueue: vi.fn().mockResolvedValue(true),
  },
}));

vi.doMock('@/lib/offlineStorage', () => ({
  offlineStorage: {
    loadCache: vi.fn((table: string) => Promise.resolve(cacheControl.data[table] ?? null)),
    saveCache: vi.fn(),
    clearCache: vi.fn(),
  },
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
    control.isOnline = false;
    cacheControl.data = {};
    toastError.mockReset();
    toastSuccess.mockReset();
    authSignOut.mockReset().mockResolvedValue(undefined);
    clearLocalCacheMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
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

  describe('signOut composition', () => {
    it('does not end the auth session when the local cache cannot be cleared', async () => {
      clearLocalCacheMock.mockResolvedValue(false);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      await act(async () => { await result.current.signOut(); });

      // Fail closed: pending offline work might survive, so the session stays.
      expect(authSignOut).not.toHaveBeenCalled();
    });

    it('ends the auth session after the cache clears successfully', async () => {
      clearLocalCacheMock.mockResolvedValue(true);
      const { result } = renderHook(() => useFarm(), { wrapper });
      await waitFor(() => expect(result.current.initialFetchComplete).toBe(true));

      await act(async () => { await result.current.signOut(); });

      expect(clearLocalCacheMock).toHaveBeenCalled();
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
  });
});
