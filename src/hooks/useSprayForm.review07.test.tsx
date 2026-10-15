/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Field, SprayRecord } from '@/types/farm';
import { toLocalIsoDate } from '@/utils/dates';

import { useSprayForm } from './useSprayForm';

const mocks = vi.hoisted(() => ({ save: vi.fn(), update: vi.fn(), current: vi.fn(), historical: vi.fn() }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => ({
  addSprayRecord: mocks.save, updateSprayRecord: mocks.update, addSprayRecipe: vi.fn(),
  sprayRecipes: [], sprayRecords: [], cluAssignments: [], viewingSeason: 2026,
  session: { user: { id: 'review07' } },
}) }));
vi.mock('@/store/useAppPreferences', () => ({ useAppPreferences: () => ({ preferences: { country: 'US' } }) }));
vi.mock('@/services/WeatherService', () => ({ WeatherService: { fetchCurrentWeather: mocks.current, fetchHistoricalConditions: mocks.historical } }));
vi.mock('@/lib/native', () => ({ native: { haptic: { error: vi.fn(), light: vi.fn(), success: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const field: Field = { id: 'f', farm_id: 'farm', name: 'North', acreage: 40, lat: 38, lng: -94, deleted_at: null };
const record: SprayRecord = { id: 's', farm_id: 'farm', fieldId: 'f', fieldName: 'North',
  products: [{ product: 'Test', rate: '32', rateUnit: 'fl oz/ac', epaRegNumber: '123' }],
  treatedAreaSize: 5000, treatedAreaUnit: 'sqft', windSpeed: 7, windDirection: 'N', temperature: 72,
  relativeHumidity: 50, pic: 'historical-pic', timestamp: 0, seasonYear: 2026, deleted_at: null,
  sprayDate: '2026-05-01', startTime: '08:00', endTime: '09:00',
};
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.current.mockResolvedValue({ wind: 7, windDirection: 'N', temp: 72, humidity: 50 });
  mocks.save.mockResolvedValue(true); mocks.update.mockResolvedValue(true);
});

describe('spray form review-07', () => {
  it('recalculates and saves square-foot totals while retaining the historical PIC', async () => {
    const { result } = renderHook(() => useSprayForm({ field, open: true, onClose: vi.fn(), initialData: record }));
    await waitFor(() => expect(result.current.products[0].totalProductAmount).toBe('3.7'));
    expect(result.current.products[0].totalProductUnit).toBe('fl oz');
    await act(async () => { await result.current.handleSubmit(); await result.current.handleSubmit(); });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      pic: 'historical-pic', treatedAreaSize: 5000, treatedAreaUnit: 'sqft', totalAmountApplied: 3.7,
      products: [expect.objectContaining({ totalProductAmount: '3.7', totalProductUnit: 'fl oz' })],
    }));
  });

  it('uses blank equipment and REI defaults and clears current weather on a backdate', async () => {
    const { result } = renderHook(() => useSprayForm({ field, open: true, onClose: vi.fn() }));
    await waitFor(() => expect(result.current.weather?.temp).toBe(72));
    expect(result.current.equipmentId).toBe(''); expect(result.current.rei).toBe('');
    await act(async () => { result.current.setSprayDate('2026-05-01'); });
    expect(result.current.weather).toBeNull(); expect(result.current.manualWindSpeed).toBe('');
    const calls = mocks.current.mock.calls.length;
    await act(async () => { result.current.setStartTime('08:00'); });
    expect(mocks.current).toHaveBeenCalledTimes(calls);
  });

  it('does not fetch current conditions for a duplicate whose start time is far from now', async () => {
    const now = new Date();
    const farTime = `${String((now.getHours() + 12) % 24).padStart(2, '0')}:00`;
    const { result } = renderHook(() => useSprayForm({ field, open: true, onClose: vi.fn(),
      initialData: { ...record, sprayDate: toLocalIsoDate(now.getTime()), startTime: farTime }, mode: 'duplicate' }));
    await act(async () => {});
    expect(mocks.current).not.toHaveBeenCalled(); expect(result.current.weather).toBeNull();
    await act(async () => { await result.current.handleSubmit(); await result.current.handleSubmit(); });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ temperature: undefined, relativeHumidity: undefined }));
  });

  it('clears stored conditions when an edited record changes application time', async () => {
    const { result } = renderHook(() => useSprayForm({ field, open: true, onClose: vi.fn(), initialData: record }));
    await act(async () => { result.current.setSprayDate('2026-05-02'); });
    expect(result.current.weather).toBeNull();
    await act(async () => { await result.current.handleSubmit(); await result.current.handleSubmit(); });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ temperature: undefined, relativeHumidity: undefined }));
  });
});
