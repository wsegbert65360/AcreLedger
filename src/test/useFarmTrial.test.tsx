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
    await waitFor(() => expect(result.current).toEqual(farm));
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
