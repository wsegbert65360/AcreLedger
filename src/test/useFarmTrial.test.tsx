import { renderHook, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabaseMock';

const state = vi.hoisted(() => ({ farm_id: 'farm-1', session: { user: { id: 'user-1' } } }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => state }));
const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));
let useFarmTrial: typeof import('@/hooks/useFarmTrial').useFarmTrial;
beforeAll(async () => { useFarmTrial = (await import('@/hooks/useFarmTrial')).useFarmTrial; });
beforeEach(() => { mock.reset(); state.farm_id = 'farm-1'; });
describe('current farm trial read', () => {
  it('reads only server-owned dates for the selected farm', async () => {
    const farm = { trial_started_at: '2026-10-01T00:00:00Z', trial_ends_at: '2027-01-01T00:00:00Z' };
    mock.setTableHandler('farms', { data: farm, error: null });
    const { result, rerender } = renderHook(() => useFarmTrial());
    await waitFor(() => expect(result.current).toEqual({ ...farm, comp: null }));
    expect(mock.fns.from).toHaveBeenCalledWith('farms');
    expect(mock.fns.select).toHaveBeenCalledWith('trial_started_at, trial_ends_at');
    expect(mock.fns.eq).toHaveBeenCalledWith('id', 'farm-1');
    expect(mock.fns.update).not.toHaveBeenCalled();
    state.farm_id = 'farm-2';
    mock.setTablePages('farms', [new Promise(() => {})]);
    rerender();
    expect(result.current).toBeNull();
  });
  it('fails quietly on a read error', async () => {
    mock.setTableHandler('farms', { data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useFarmTrial());
    await waitFor(() => expect(result.current).toBeNull());
  });
});

describe('comp status read', () => {
  const farm = { trial_started_at: '2026-10-01T12:00:00Z', trial_ends_at: '2099-01-01T12:00:00Z' };
  it.each([null, '2099-02-01T12:00:00Z', '2000-01-01T12:00:00Z'])('reads comp expiry %s through the farm-scoped RPC', async expires_at => {
    mock.setTableHandler('farms', { data: farm, error: null });
    mock.setRpcResult({ data: [{ is_comped: true, expires_at }], error: null });
    const { result } = renderHook(() => useFarmTrial());
    await waitFor(() => expect(result.current?.comp).toEqual({ is_comped: true, expires_at }));
    expect(mock.fns.rpc).toHaveBeenCalledWith('get_farm_comp_status', { p_farm_id: 'farm-1' });
  });
  it.each(['error', 'throw'])('preserves trial dates on RPC %s', async mode => {
    mock.setTableHandler('farms', { data: farm, error: null });
    if (mode === 'throw') mock.setRpcThrow(new Error('offline'));
    else mock.setRpcResult({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useFarmTrial());
    await waitFor(() => expect(result.current).toEqual({ ...farm, comp: null }));
  });
});
