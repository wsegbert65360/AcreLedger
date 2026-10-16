/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const fetchCurrentWeather = vi.fn();
const fetchComprehensiveRainfall = vi.fn();

const zipState = vi.hoisted(() => ({ saved: '64093', native: false, saveZip: vi.fn(), resolveCoords: vi.fn() }));
vi.mock('@/lib/native', () => ({ isNativePlatform: () => zipState.native }));

const farmState = vi.hoisted(() => ({
  initialFetchComplete: true,
  fields: [{ id: 'f1', lat: 39.1234, lng: -93.5678 }] as { id: string; lat: number | null; lng: number | null }[],
}));

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

vi.mock('@/lib/weatherHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/weatherHelpers')>('@/lib/weatherHelpers');
  return {
    ...actual,
    loadZip: () => zipState.saved,
    saveZip: zipState.saveZip,
    loadCachedWeatherCoords: () => null,
    resolveCoords: zipState.resolveCoords,
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
    zipState.saved = '64093';
    zipState.native = false;
    zipState.saveZip.mockReset();
    zipState.resolveCoords.mockResolvedValue({ lat: 0, lng: 0, locationString: '' });
    farmState.initialFetchComplete = true;
    navigate.mockReset();
    fetchCurrentWeather.mockReset();
    fetchComprehensiveRainfall.mockReset();
    fetchComprehensiveRainfall.mockResolvedValue({ '24h': 0, '72h': 0, '168h': 0, '7d': 0, sincePlanting: 0, sinceLastSpray: 0, periodEndUtc: '2026-09-02T00:00:00Z' });
    farmState.fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];
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
});

describe('WeatherBar without a location', () => {
  beforeEach(() => {
    zipState.saved = '';
    farmState.fields = [];
    farmState.initialFetchComplete = true;
    zipState.native = true;
    zipState.saveZip.mockClear();
    navigate.mockClear();
    fetchCurrentWeather.mockReset();
    fetchCurrentWeather.mockResolvedValue({ temp: 72, wind: 4, humidity: 55, windDirection: 'S' });
    zipState.resolveCoords.mockResolvedValue({ lat: 0, lng: 0, locationString: '' });
  });
  it('shows No Location on native without fetching or navigating', async () => {
    render(<WeatherBar />);
    fireEvent.click(await screen.findByRole('heading', { name: 'No Location' }));
    expect(screen.getByLabelText('Zip code or coordinates')).toBeInTheDocument();
    expect(screen.queryByText('Loading?')).toBeNull();
    expect(fetchCurrentWeather).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open weather' })).toBeNull();
  });
  it('shows No Location when web resolution returns empty', async () => {
    zipState.native = false;
    render(<WeatherBar />);
    expect(await screen.findByRole('heading', { name: 'No Location' })).toBeInTheDocument();
  });
  it('waits for field hydration', () => {
    farmState.initialFetchComplete = false;
    render(<WeatherBar />);
    expect(screen.getByText('Loading?')).toBeInTheDocument();
    expect(screen.queryByText('No Location')).toBeNull();
  });
  it('saves a submitted ZIP and loads the normal card', async () => {
    render(<WeatherBar />);
    fireEvent.change(await screen.findByLabelText('Zip code or coordinates'), { target: { value: '72301' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(zipState.saveZip).toHaveBeenCalledWith('72301', 'user-1');
    await waitFor(() => expect(fetchCurrentWeather).toHaveBeenCalledWith('72301', expect.any(AbortSignal)));
    expect(screen.getByRole('button', { name: 'Open weather' })).toBeInTheDocument();
  });
  it('shows invalid input without fetching', async () => {
    render(<WeatherBar />);
    fireEvent.change(await screen.findByLabelText('Zip code or coordinates'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Enter a valid 5/9-digit zip or lat,lng')).toBeInTheDocument();
    expect(fetchCurrentWeather).not.toHaveBeenCalled();
  });
});
