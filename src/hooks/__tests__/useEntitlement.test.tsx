/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freeEntitlement, isFreeTierLocked } from '@/lib/entitlements';

const rpc = vi.hoisted(() => vi.fn());
const farmState = vi.hoisted(() => ({
  farm_id: 'farm-1' as string | null,
  session: { user: { id: 'user-1' } } as { user?: { id: string } } | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmState,
}));

import { useEntitlement } from '../useEntitlement';

const CACHE_KEY = 'user-1_al_entitlement_farm-1';

const paidRow = {
  plan: 'paid',
  premium_until: '2027-06-01T00:00:00.000Z',
  field_cap: null,
  rainfall_slot_cap: null,
  photo_cap: null,
  history_seasons: null,
  device_cap: null,
  enforced: true,
};

function cachedPro() {
  return {
    ...freeEntitlement(true),
    plan: 'paid' as const,
    premiumUntil: '2027-06-01T00:00:00.000Z',
  };
}

describe('useEntitlement', () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset();
    farmState.farm_id = 'farm-1';
    farmState.session = { user: { id: 'user-1' } };
  });

  it('stays loading with no entitlement while the first request is pending and nothing is cached', async () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEntitlement());

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('farm_entitlement', { p_farm_id: 'farm-1' }));
    expect(result.current.entitlement).toBeNull();
    expect(result.current.cachedEntitlement).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it('fails closed without caching when the request errors and nothing is cached', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useEntitlement());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.entitlement).toBeNull();
    expect(result.current.cachedEntitlement).toBeNull();
    expect(isFreeTierLocked(result.current.entitlement)).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('fails closed when the request throws and nothing is cached', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useEntitlement());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.entitlement).toBeNull();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('keeps a cached Pro plan when the request fails offline', async () => {
    const paid = cachedPro();
    localStorage.setItem(CACHE_KEY, JSON.stringify(paid));
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useEntitlement());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current.failed).toBe(false);
    expect(result.current.entitlement).toMatchObject({ plan: 'paid', enforced: true });
    expect(isFreeTierLocked(result.current.entitlement)).toBe(false);
    expect(result.current.cachedEntitlement).toMatchObject({ plan: 'paid' });
    expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')).toMatchObject({ plan: 'paid' });
  });

  it('stores a successful server answer and clears a previous failure', async () => {
    rpc.mockResolvedValue({ data: [paidRow], error: null });
    const { result } = renderHook(() => useEntitlement());

    await waitFor(() => expect(result.current.entitlement?.plan).toBe('paid'));
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')).toMatchObject({
      plan: 'paid',
      premiumUntil: '2027-06-01T00:00:00.000Z',
      enforced: true,
    });
  });
});
