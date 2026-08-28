/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const fetchCurrentWeather = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/store/farmStore', () => {
  const fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];
  return {
    useFarm: () => ({
      session: { user: { id: 'user-1' } },
      fields,
    }),
  };
});

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
    fetchComprehensiveRainfall: vi.fn().mockResolvedValue({ '24h': 0, '72h': 0 }),
  },
}));

import WeatherBar from '../WeatherWidget';

describe('WeatherBar', () => {
  beforeEach(() => {
    navigate.mockReset();
    fetchCurrentWeather.mockReset();
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
});
