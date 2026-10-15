/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const fetchCurrentWeather = vi.fn();
const fetchComprehensiveRainfall = vi.fn();

const farmState = vi.hoisted(() => ({
  fields: [{ id: 'f1', lat: 39.1234, lng: -93.5678 }] as { id: string; lat: number | null; lng: number | null }[],
  initialFetchComplete: true,
}));

const weatherHelpersMock = vi.hoisted(() => ({
  loadZip: vi.fn<(userId?: string) => string>(() => '64093'),
  loadCachedWeatherCoords: vi.fn((): { lat: number; lon: number; ts: number } | null => null),
  resolveCoords: vi.fn<(
    fields: { lat: number | null; lng: number | null }[],
    savedZip: string,
    options?: { forceRefresh?: boolean; passive?: boolean },
  ) => Promise<{ lat: number; lng: number; locationString: string }>>(
    async () => ({ lat: 0, lng: 0, locationString: '' }),
  ),
}));

const nativeState = vi.hoisted(() => ({ isNative: false }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    session: { user: { id: 'user-1' } },
    fields: farmState.fields,
    initialFetchComplete: farmState.initialFetchComplete,
  }),
}));

vi.mock('@/lib/native', () => ({
  isNativePlatform: () => nativeState.isNative,
}));

vi.mock('@/lib/weatherHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/weatherHelpers')>('@/lib/weatherHelpers');
  return {
    ...actual,
    loadZip: (userId?: string) => weatherHelpersMock.loadZip(userId),
    loadCachedWeatherCoords: () => weatherHelpersMock.loadCachedWeatherCoords(),
    resolveCoords: (...args: Parameters<typeof actual.resolveCoords>) => weatherHelpersMock.resolveCoords(...args),
  };
});

vi.mock('@/services/WeatherService', () => ({
  WeatherService: {
    fetchCurrentWeather: (...args: unknown[]) => fetchCurrentWeather(...args),
  },
}));

vi.mock('@/services/RainService', () => ({
  RainService: {
    fetchComprehensiveRainfall: (...args: unknown[]) => fetchComprehensiveRainfall(...args),
  },
}));

import WeatherBar from '../WeatherWidget';

describe('WeatherBar', () => {
  beforeEach(() => {
    navigate.mockReset();
    fetchCurrentWeather.mockReset();
    fetchComprehensiveRainfall.mockReset();
    fetchComprehensiveRainfall.mockResolvedValue({ '24h': 0, '72h': 0, '168h': 0, '7d': 0, sincePlanting: 0, sinceLastSpray: 0, periodEndUtc: '2026-09-02T00:00:00Z' });
    farmState.fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];
    farmState.initialFetchComplete = true;
    nativeState.isNative = false;
    weatherHelpersMock.loadZip.mockReset();
    weatherHelpersMock.loadZip.mockReturnValue('64093');
    weatherHelpersMock.loadCachedWeatherCoords.mockReset();
    weatherHelpersMock.loadCachedWeatherCoords.mockReturnValue(null);
    weatherHelpersMock.resolveCoords.mockReset();
    weatherHelpersMock.resolveCoords.mockResolvedValue({ lat: 0, lng: 0, locationString: '' });
  });

  it('shows a muted retry state instead of Offline when weather fails', async () => {
    fetchCurrentWeather.mockResolvedValue({
      wind: 0,
      temp: 0,
      humidity: 0,
      windDirection: '—',
      locationName: 'Unknown',
      isError: true,
    });

    render(<WeatherBar />);

    expect(await screen.findByText(/Weather unavailable · tap to retry/i)).toBeTruthy();
    expect(screen.queryByText(/Offline/i)).toBeNull();

    const callsBeforeRetry = fetchCurrentWeather.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Weather unavailable, tap to retry/i }));

    await waitFor(() => expect(fetchCurrentWeather.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not activate the weather card when Space is typed in the location input', async () => {
    fetchCurrentWeather.mockResolvedValue({
      wind: 4,
      temp: 72,
      humidity: 55,
      windDirection: 'S',
      locationName: 'Warrensburg',
      isError: false,
    });

    render(<WeatherBar />);
    await screen.findByText('72°F');

    const callsBeforeSpace = fetchCurrentWeather.mock.calls.length;
    const locationInput = screen.getByLabelText(/Zip code or coordinates/i);
    fireEvent.keyDown(locationInput, { key: ' ' });

    expect(navigate).not.toHaveBeenCalled();
    expect(fetchCurrentWeather).toHaveBeenCalledTimes(callsBeforeSpace);
  });

  it('uses resolved ZIP coordinates even when unrelated fields arrive later', async () => {
    farmState.fields = [];
    fetchCurrentWeather.mockResolvedValue({
      wind: 8,
      temp: 72,
      humidity: 55,
      windDirection: 'S',
      locationName: 'Warrensburg',
      isError: false,
      latitude: 40.7128,
      longitude: -74.006,
      precip24h: 0,
      precip72h: 0,
    });
    fetchComprehensiveRainfall.mockResolvedValue({
      '24h': 0.42,
      '72h': 1.1,
      '168h': 1.1,
      '7d': 1.1,
      sincePlanting: 0,
      sinceLastSpray: 0,
      periodEndUtc: '2026-09-02T00:00:00Z',
    });

    const { rerender } = render(<WeatherBar />);
    await screen.findByText(/72\u00b0F/);
    await screen.findByText('0.42"');
    expect(fetchComprehensiveRainfall).toHaveBeenCalledWith(expect.objectContaining({ lat: 40.7128, lng: -74.006 }));

    farmState.fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];
    rerender(<WeatherBar />);

    expect(fetchComprehensiveRainfall).toHaveBeenCalledTimes(1);
    expect(fetchComprehensiveRainfall.mock.calls[0][0].fieldId).toBeUndefined();
    expect(await screen.findByText('0.42"')).toBeTruthy();
  });

  it('does not commit aborted radar rain as 0.00 success', async () => {
    fetchCurrentWeather.mockResolvedValue({
      wind: 8,
      temp: 72,
      humidity: 55,
      windDirection: 'S',
      locationName: 'Warrensburg',
      isError: false,
      latitude: 40.7128,
      longitude: -74.006,
      precip24h: 0.25,
      precip72h: 0.4,
    });
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchComprehensiveRainfall.mockRejectedValue(abortErr);

    render(<WeatherBar />);
    await screen.findByText(/72\u00b0F/);
    expect(await screen.findByText('0.25"')).toBeTruthy();
    expect(screen.queryByText('0.00"')).toBeNull();
  });

  it('shows a set-zip prompt when location is denied and nothing is saved', async () => {
    weatherHelpersMock.loadZip.mockReturnValue('');
    farmState.fields = [];
    weatherHelpersMock.resolveCoords.mockResolvedValue({ lat: 0, lng: 0, locationString: '' });

    render(<WeatherBar />);

    const prompt = await screen.findByText('Set your zip code to see weather');
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(fetchCurrentWeather).not.toHaveBeenCalled();

    fireEvent.click(prompt);
    expect(screen.getByLabelText(/Zip code or coordinates/i)).toHaveFocus();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a set-zip prompt when location resolution rejects and nothing is saved', async () => {
    weatherHelpersMock.loadZip.mockReturnValue('');
    farmState.fields = [];
    weatherHelpersMock.resolveCoords.mockRejectedValue(new Error('denied'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<WeatherBar />);

    expect(await screen.findByText('Set your zip code to see weather')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(fetchCurrentWeather).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('shows a set-zip prompt on native when nothing is saved after fields hydrate', async () => {
    nativeState.isNative = true;
    weatherHelpersMock.loadZip.mockReturnValue('');
    farmState.fields = [];

    render(<WeatherBar />);

    expect(await screen.findByText('Set your zip code to see weather')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(weatherHelpersMock.resolveCoords).not.toHaveBeenCalled();
    expect(fetchCurrentWeather).not.toHaveBeenCalled();
  });

  it('keeps loading until fields hydrate before asking for a zip', () => {
    weatherHelpersMock.loadZip.mockReturnValue('');
    farmState.fields = [];
    farmState.initialFetchComplete = false;

    render(<WeatherBar />);

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(weatherHelpersMock.resolveCoords).not.toHaveBeenCalled();
  });

  it('loads weather for a saved zip', async () => {
    weatherHelpersMock.loadZip.mockReturnValue('64093');
    farmState.fields = [];
    fetchCurrentWeather.mockResolvedValue({
      wind: 4,
      temp: 68,
      humidity: 40,
      windDirection: 'N',
      locationName: "Lee's Summit",
      isError: false,
    });

    render(<WeatherBar />);

    expect(await screen.findByText('68°F')).toBeTruthy();
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(fetchCurrentWeather).toHaveBeenCalledWith('64093', expect.any(AbortSignal));
  });

  it('loads weather from field coordinates when no zip is saved', async () => {
    weatherHelpersMock.loadZip.mockReturnValue('');
    farmState.fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];
    fetchCurrentWeather.mockResolvedValue({
      wind: 3,
      temp: 70,
      humidity: 50,
      windDirection: 'E',
      locationName: 'Field',
      isError: false,
    });

    render(<WeatherBar />);

    expect(await screen.findByText('70°F')).toBeTruthy();
    expect(fetchCurrentWeather).toHaveBeenCalledWith('39.1234,-93.5678', expect.any(AbortSignal));
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(weatherHelpersMock.resolveCoords).not.toHaveBeenCalled();
  });

  it('loads weather from cached coordinates when no zip or field is saved', async () => {
    weatherHelpersMock.loadZip.mockReturnValue('');
    farmState.fields = [];
    weatherHelpersMock.loadCachedWeatherCoords.mockReturnValue({ lat: 38.5, lon: -90.25, ts: Date.now() });
    fetchCurrentWeather.mockResolvedValue({
      wind: 6,
      temp: 71,
      humidity: 48,
      windDirection: 'W',
      locationName: 'Cached',
      isError: false,
    });

    render(<WeatherBar />);

    expect(await screen.findByText('71°F')).toBeTruthy();
    expect(fetchCurrentWeather).toHaveBeenCalledWith('38.5,-90.25', expect.any(AbortSignal));
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
