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
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    session: { user: { id: 'user-1' } },
    fields: farmState.fields,
  }),
}));

vi.mock('@/lib/weatherHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/weatherHelpers')>('@/lib/weatherHelpers');
  return {
    ...actual,
    loadZip: () => '64093',
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

  it('overlays radar rain when fields arrive after the first zip load without a tap', async () => {
    farmState.fields = [];
    fetchCurrentWeather.mockResolvedValue({
      wind: 8,
      temp: 72,
      humidity: 55,
      windDirection: 'S',
      locationName: 'Warrensburg',
      isError: false,
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
    expect(fetchComprehensiveRainfall).not.toHaveBeenCalled();
    expect(screen.getByText('0.00"')).toBeTruthy();

    farmState.fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];
    rerender(<WeatherBar />);

    await waitFor(() => expect(fetchComprehensiveRainfall).toHaveBeenCalled());
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
