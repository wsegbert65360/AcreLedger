/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  getSession: vi.fn(), onAuthStateChange: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn(),
};
const state = {
  profile: { farm_id: 'farm-1', active_season: 2025, onboarding_complete: true },
  realtime: null as null | ((payload: { new?: { active_season?: number } }) => void),
};
const from = vi.fn(() => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'single', 'update']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.profile, error: null }).then(resolve);
  return builder;
});
const channelObject = {
  on: vi.fn((_event: string, _filter: unknown, callback: typeof state.realtime) => {
    state.realtime = callback;
    return channelObject;
  }),
  subscribe: vi.fn(() => channelObject),
};
const supabase = {
  auth, from, rpc: vi.fn(), channel: vi.fn(() => channelObject), removeChannel: vi.fn(),
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
    localStorage.clear();
    state.profile = { farm_id: 'farm-1', active_season: 2025, onboarding_complete: true };
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

    act(() => window.dispatchEvent(new Event('focus')));

    await waitFor(() => expect(result.current.activeSeason).toBe(2026));
    expect(from.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
