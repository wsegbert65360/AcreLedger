import { renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabaseMock';

const state = vi.hoisted(() => ({ farm_id: 'farm-1', session: { user: { id: 'user-1' } } }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => state }));
const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));
let useFarmComp: typeof import('@/hooks/useFarmComp').useFarmComp;
beforeAll(async () => { useFarmComp = (await import('@/hooks/useFarmComp')).useFarmComp; });
beforeEach(() => { mock.reset(); state.farm_id = 'farm-1'; });
describe('comp status read', () => {
  it.each([null, '2099-02-01T12:00:00Z', '2000-01-01T12:00:00Z'])('reads comp expiry %s through the farm-scoped RPC', async expires_at => {
    mock.setRpcResult({ data: [{ is_comped: true, expires_at }], error: null });
    const { result } = renderHook(() => useFarmComp());
    await waitFor(() => expect(result.current).toEqual({ is_comped: true, expires_at }));
    expect(mock.fns.rpc).toHaveBeenCalledWith('get_farm_comp_status', { p_farm_id: 'farm-1' });
  });
  it('clears when the selected farm changes', async () => {
    mock.setRpcResult({ data: [{ is_comped: true, expires_at: null }], error: null });
    const { result, rerender } = renderHook(() => useFarmComp());
    await waitFor(() => expect(result.current).not.toBeNull());
    state.farm_id = 'farm-2';
    mock.setRpcResult({ data: null, error: { message: 'offline' } });
    rerender();
    expect(result.current).toBeNull();
  });
  it.each(['error', 'throw'])('returns null on RPC %s', async mode => {
    if (mode === 'throw') mock.setRpcThrow(new Error('offline'));
    else mock.setRpcResult({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useFarmComp());
    await waitFor(() => expect(mock.fns.rpc).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
