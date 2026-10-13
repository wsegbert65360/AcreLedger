/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock, type SupabaseResult } from '@/test/supabaseMock';

const auth = {
  getSession: vi.fn(), onAuthStateChange: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn(), stopAutoRefresh: vi.fn(), admin: { signOut: vi.fn() },
};
const state = {
  profile: { farm_id: 'farm-1', active_season: 2025, onboarding_complete: true },
  realtime: null as null | ((payload: { new?: { active_season?: number } }) => void),
};
const cloud = createSupabaseMock();
const from = cloud.fns.from;
const channelObject = {
  on: vi.fn((_event: string, _filter: unknown, callback: typeof state.realtime) => {
    state.realtime = callback;
    return channelObject;
  }),
  subscribe: vi.fn(() => channelObject),
};
const supabase = {
  ...cloud.client, auth, channel: vi.fn(() => channelObject), removeChannel: vi.fn(),
};

vi.doMock('@/lib/supabase', () => ({ supabase }));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useAuth: (typeof import('../useAuth'))['useAuth'];
beforeAll(async () => ({ useAuth } = await import('../useAuth')));

const session = {
  user: { id: 'user-1', app_metadata: { farm_id: 'farm-1' }, user_metadata: {} },
};

describe('useAuth session and active-season synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cloud.reset();
    localStorage.clear();
    state.profile = { farm_id: 'farm-1', active_season: 2025, onboarding_complete: true };
    cloud.setResult({ data: state.profile });
    cloud.setTableHandler('account_deletion_requests', { data: null });
    state.realtime = null;
    auth.getSession.mockResolvedValue({ data: { session } });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    auth.refreshSession.mockResolvedValue({ data: { session }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  it('delegates sign-out to Supabase auth', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signOut(); });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('advances a current viewing season on a remote rollover', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(state.realtime).toBeTypeOf('function'));
    await waitFor(() => expect(result.current.activeSeason).toBe(2025));

    act(() => state.realtime?.({ new: { active_season: 2026 } }));

    expect(result.current.activeSeason).toBe(2026);
    expect(result.current.viewingSeason).toBe(2026);
  });

  it('preserves an allowed historical viewing season on a remote rollover', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(state.realtime).toBeTypeOf('function'));
    await waitFor(() => expect(result.current.activeSeason).toBe(2025));
    act(() => result.current.setViewingSeason(2023));

    act(() => state.realtime?.({ new: { active_season: 2026 } }));

    expect(result.current.activeSeason).toBe(2026);
    expect(result.current.viewingSeason).toBe(2023);
  });

  it('refreshes the profile after the window regains focus', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(state.realtime).toBeTypeOf('function'));
    await waitFor(() => expect(result.current.activeSeason).toBe(2025));
    const callsBefore = from.mock.calls.length;
    state.profile = { ...state.profile, active_season: 2026 };
    cloud.setResult({ data: state.profile });

    act(() => window.dispatchEvent(new Event('focus')));

    await waitFor(() => expect(result.current.activeSeason).toBe(2026));
    expect(from.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('resets all identity state on sign-out and ignores a late profile', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.onboardingComplete).toBe(true));
    let finish!: (value: Partial<SupabaseResult>) => void;
    cloud.setTablePages('profiles', [new Promise(resolve => { finish = resolve; })]);
    act(() => auth.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { ...session }));
    await waitFor(() => expect(cloud.fns.single).toHaveBeenCalledTimes(2));
    act(() => auth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null));
    await act(async () => finish({ data: state.profile }));
    expect(result.current.session).toBeNull();
    expect(result.current.farm_id).toBeNull();
    expect(result.current.onboardingComplete).toBe(false);
    expect(result.current.activeSeason).toBe(new Date().getFullYear());
    expect(result.current.viewingSeason).toBe(new Date().getFullYear());
  });

  it('discards late A profile and realtime updates after switching to B', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.onboardingComplete).toBe(true));
    const oldRealtime = state.realtime;
    let finishA!: (value: Partial<SupabaseResult>) => void;
    let finishB!: (value: Partial<SupabaseResult>) => void;
    cloud.setTablePages('profiles', [
      new Promise(resolve => { finishA = resolve; }),
      new Promise(resolve => { finishB = resolve; }),
    ]);
    act(() => auth.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { ...session }));
    await waitFor(() => expect(cloud.fns.single).toHaveBeenCalledTimes(2));
    act(() => auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', {
      user: { id: 'user-2', app_metadata: {}, user_metadata: {} },
    }));
    expect(result.current.farm_id).toBeNull();
    expect(result.current.onboardingComplete).toBe(false);
    expect(result.current.activeSeason).toBe(new Date().getFullYear());
    expect(result.current.viewingSeason).toBe(new Date().getFullYear());
    await waitFor(() => expect(cloud.fns.single).toHaveBeenCalledTimes(3));
    await act(async () => finishB({ data: { farm_id: 'farm-2', active_season: 2024, onboarding_complete: false } }));
    await act(async () => {
      finishA({ data: { farm_id: 'farm-1', active_season: 2023, onboarding_complete: true } });
      oldRealtime?.({ new: { active_season: 2022 } });
    });
    expect(result.current.farm_id).toBe('farm-2');
    expect(result.current.activeSeason).toBe(2024);
    expect(result.current.viewingSeason).toBe(2024);
    expect(result.current.onboardingComplete).toBe(false);
    expect(localStorage.getItem('user-2_al_onboarding_complete')).toBeNull();
  });

  it('reconciles profile onboarding false over a cached true value', async () => {
    localStorage.setItem('user-1_al_onboarding_complete', '1');
    cloud.setResult({ data: { ...state.profile, onboarding_complete: false } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.farm_id).toBe('farm-1'));
    await waitFor(() => expect(result.current.onboardingComplete).toBe(false));
    expect(localStorage.getItem('user-1_al_onboarding_complete')).toBeNull();
  });

  it('ignores user-editable farm metadata at bootstrap, events and refresh comparison', async () => {
    const forgedSession = { user: { id: 'user-1', app_metadata: {}, user_metadata: { farm_id: 'forged' } } };
    auth.getSession.mockResolvedValue({ data: { session: forgedSession } });
    let finish!: (value: Partial<SupabaseResult>) => void;
    cloud.setTablePages('profiles', [new Promise(resolve => { finish = resolve; })]);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.farm_id).toBeNull();
    await act(async () => finish({ data: { ...state.profile, farm_id: 'forged' } }));
    expect(result.current.farm_id).toBe('forged'); // The profile is trusted, metadata is not.
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    cloud.setResult({ data: null });
    act(() => auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', {
      user: { id: 'user-2', app_metadata: {}, user_metadata: { farm_id: 'foreign' } },
    }));
    expect(result.current.farm_id).toBeNull();
  });

  it('refreshes only once per user when refreshed metadata remains absent', async () => {
    const withoutClaim = { user: { ...session.user, app_metadata: {} } };
    auth.getSession.mockResolvedValue({ data: { session: withoutClaim } });
    auth.refreshSession.mockImplementation(async () => {
      auth.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { ...withoutClaim });
      return { data: { session: withoutClaim }, error: null };
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.activeSeason).toBe(2025));
    await waitFor(() => expect(cloud.fns.single).toHaveBeenCalledTimes(2));
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => auth.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { ...withoutClaim }));
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not let a late getSession restore an identity after sign-out', async () => {
    let finish!: (value: unknown) => void;
    auth.getSession.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useAuth());
    act(() => auth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null));
    await act(async () => finish({ data: { session } }));
    expect(result.current.session).toBeNull();
    expect(result.current.farm_id).toBeNull();
    expect(cloud.fns.from).not.toHaveBeenCalled();
  });

  it('retries farm initialization on demand after an initial RPC failure', async () => {
    cloud.setResult({ data: { ...state.profile, farm_id: null } });
    cloud.setRpcResult({ error: { message: 'offline' } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(cloud.fns.rpc).toHaveBeenCalledTimes(1));
    cloud.setRpcResult({ data: 'farm-retried', error: null });
    await act(async () => expect(await result.current.ensureFarm()).toBe('farm-retried'));
    expect(result.current.farm_id).toBe('farm-retried');
  });

  it('ends local state on network sign-out failure and returns pending status', async () => {
    const { authStorageKey } = await import('@/lib/authStorage');
    localStorage.setItem(authStorageKey(), 'persisted-session');
    auth.signOut.mockResolvedValue({ error: { message: 'network unavailable' } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.onboardingComplete).toBe(true));
    await act(async () => {
      expect(await result.current.signOut()).toEqual({ signedOut: true, serverPending: true });
    });
    expect(localStorage.getItem(authStorageKey())).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.farm_id).toBeNull();
    expect(result.current.onboardingComplete).toBe(false);
  });

  it('does not initialize a farm for an account with deletion pending', async () => {
    cloud.setTableHandler('account_deletion_requests', { data: { status: 'pending' } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.deletionStatus).toBe('pending'));
    expect(result.current.farm_id).toBeNull();
    expect(cloud.fns.from).toHaveBeenCalledWith('account_deletion_requests');
    expect(cloud.fns.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(cloud.fns.from).not.toHaveBeenCalledWith('profiles');
    expect(cloud.fns.rpc).not.toHaveBeenCalled();
  });

  it('preserves cached offline access when deletion status cannot be checked and retries online', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { ...session.user, app_metadata: {} } } } });
    localStorage.setItem('user-1_al_farm_id', 'cached-farm');
    cloud.setTableHandler('account_deletion_requests', { error: { message: 'offline' } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deletionStatus).toBe('clear');
    expect(result.current.farm_id).toBe('cached-farm');
    expect(cloud.fns.from).not.toHaveBeenCalledWith('profiles');
    cloud.setTableHandler('account_deletion_requests', { data: { status: 'pending' } });
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.deletionStatus).toBe('pending'));
    expect(result.current.farm_id).toBeNull();
  });

  it('keeps cached access during an unresolved deletion check and after a thrown error', async () => {
    let reject!: (error: Error) => void;
    cloud.setTablePages('account_deletion_requests', [new Promise((_resolve, fail) => { reject = fail; })]);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.farm_id).toBe('farm-1');
    expect(result.current.deletionStatus).toBe('clear');
    await act(async () => reject(new Error('timeout')));
    expect(result.current.farm_id).toBe('farm-1');
    expect(result.current.deletionStatus).toBe('clear');
  });

  it('retains positive pending status on a failed foreground retry and clears it after cancellation', async () => {
    cloud.setTableHandler('account_deletion_requests', { data: { status: 'pending' } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.deletionStatus).toBe('pending'));
    cloud.setTableHandler('account_deletion_requests', { error: { message: 'offline' } });
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(result.current.deletionStatus).toBe('pending');
    expect(result.current.farm_id).toBeNull();
    cloud.setTableHandler('account_deletion_requests', { data: { status: 'cancelled' } });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(result.current.deletionStatus).toBe('clear'));
    await waitFor(() => expect(result.current.farm_id).toBe('farm-1'));
  });

  it('permits a later refresh retry after a failed one-shot refresh', async () => {
    const withoutClaim = { user: { ...session.user, app_metadata: {} } };
    auth.getSession.mockResolvedValue({ data: { session: withoutClaim } });
    auth.refreshSession.mockResolvedValueOnce({ error: { message: 'offline' } });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
    await act(async () => auth.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED', { ...withoutClaim }));
    await waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(2));
    expect(result.current.deletionStatus).toBe('clear');
  });
});
