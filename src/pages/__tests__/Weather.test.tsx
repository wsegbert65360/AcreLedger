/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchExtendedWeather = vi.hoisted(() => vi.fn());
const getCurrentPosition = vi.hoisted(() => vi.fn());

const farmState = vi.hoisted(() => ({
  fields: [] as { id: string; lat: number | null; lng: number | null }[],
  initialFetchComplete: true,
  session: null as { user: { id: string } } | null,
}));

const weatherHelpersMock = vi.hoisted(() => ({
  loadZip: vi.fn<(userId?: string) => string>(() => ''),
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
  useNavigate: () => vi.fn(),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    session: farmState.session,
    fields: farmState.fields,
    initialFetchComplete: farmState.initialFetchComplete,
  }),
}));

vi.mock('@/lib/native', () => ({
  isNativePlatform: () => nativeState.isNative,
  native: { geolocation: { getCurrentPosition } },
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
  WeatherService: { fetchExtendedWeather },
}));

vi.mock('@/services/RainService', () => ({
  RainService: { fetchComprehensiveRainfall: vi.fn() },
}));

vi.mock('@/components/weather/ForecastGrid', () => ({ default: () => null }));
vi.mock('@/components/weather/RadarEmbed', () => ({ default: () => null }));
vi.mock('@/components/weather/SprayDecisionMatrix', () => ({ SprayDecisionMatrix: () => null }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => null }));

import Weather, { CurrentConditionsCard } from '../Weather';
import type { ExtendedWeatherData } from '@/types/weather';

const loadedWeather: ExtendedWeatherData = {
  temp: 68,
  feelsLike: 68,
  humidity: 40,
  wind: 4,
  gusts: 6,
  windDirection: 'N',
  dewPoint: 45,
  precipProb: 10,
  precip24h: 0,
  precip72h: 0,
  precip168h: 0,
  isRainingNow: false,
  locationName: "Lee's Summit",
  cloudCover: 10,
  conditions: 'Clear',
  icon: 'clear-day',
  sunrise: '6:30 AM',
  sunset: '7:30 PM',
  isError: false,
  forecastDays: [],
};

function resolvedLocation(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
): { lat: number; lng: number; locationString: string } {
  const trimmed = savedZip.trim();
  const match = trimmed.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), locationString: trimmed };
  }
  if (trimmed) return { lat: 0, lng: 0, locationString: trimmed };
  const field = fields.find(f => f.lat != null && f.lng != null);
  if (field && field.lat != null && field.lng != null) {
    const lat = Math.round(field.lat * 10000) / 10000;
    const lng = Math.round(field.lng * 10000) / 10000;
    return { lat, lng, locationString: `${lat},${lng}` };
  }
  const cached = weatherHelpersMock.loadCachedWeatherCoords();
  if (cached) return { lat: cached.lat, lng: cached.lon, locationString: `${cached.lat},${cached.lon}` };
  return { lat: 0, lng: 0, locationString: '' };
}

const DASH = '—';

const errorWeather: ExtendedWeatherData = {
  temp: 0,
  feelsLike: 0,
  humidity: 40,
  wind: 0,
  gusts: 0,
  windDirection: DASH,
  dewPoint: 32,
  precipProb: 10,
  precip24h: 0,
  precip72h: 0,
  precip168h: 0,
  isRainingNow: false,
  locationName: 'Unknown',
  cloudCover: 0,
  conditions: '',
  icon: 'clear-day',
  sunrise: '',
  sunset: '',
  isError: true,
  forecastDays: [],
};

function miniStatText(label: string): string {
  const labelEl = screen.getByText(label);
  return labelEl.parentElement?.parentElement?.textContent ?? '';
}

describe('CurrentConditionsCard', () => {
  it('shows wind and gust placeholders instead of 0 when isError', () => {
    render(<CurrentConditionsCard weather={errorWeather} lastUpdated="" />);

    const windText = miniStatText('Wind');
    const gustText = miniStatText('Gust');

    expect(windText).toContain(DASH);
    expect(windText).not.toMatch(/0/);
    expect(gustText).toContain(DASH);
    expect(gustText).not.toMatch(/0/);
  });
  it('labels calendar fallback and displays unavailable totals without inventing zero', () => {
    const { rerender } = render(<CurrentConditionsCard weather={{ ...errorWeather, isError: false, rainfallBasis: 'calendar', precip24h: 0.4, precip72h: null, precip168h: null }} lastUpdated="" />);
    expect(screen.getByText('Yesterday').parentElement?.textContent).toContain('0.4');
    expect(screen.getByText('Last 3 days').parentElement?.textContent).toContain(DASH);
    expect(screen.queryByText('24h')).toBeNull();
    rerender(<CurrentConditionsCard weather={{ ...errorWeather, isError: false, rainfallBasis: 'rolling' }} lastUpdated="" />);
    expect(screen.getByText('24h').parentElement?.textContent).toContain('0');
    expect(screen.queryByText('Yesterday')).toBeNull();
  });
});

describe('Weather page location fallback', () => {
  beforeEach(() => {
    fetchExtendedWeather.mockReset();
    fetchExtendedWeather.mockResolvedValue(loadedWeather);
    getCurrentPosition.mockReset();
    farmState.fields = [];
    farmState.initialFetchComplete = true;
    farmState.session = null;
    nativeState.isNative = false;
    weatherHelpersMock.loadZip.mockReset();
    weatherHelpersMock.loadZip.mockReturnValue('');
    weatherHelpersMock.loadCachedWeatherCoords.mockReset();
    weatherHelpersMock.loadCachedWeatherCoords.mockReturnValue(null);
    weatherHelpersMock.resolveCoords.mockReset();
    weatherHelpersMock.resolveCoords.mockImplementation(async (fields, saved) => resolvedLocation(fields, saved));
  });

  it('shows a set-zip prompt when location is denied and nothing is saved', async () => {
    weatherHelpersMock.resolveCoords.mockResolvedValue({ lat: 0, lng: 0, locationString: '' });

    render(<Weather />);

    expect(await screen.findByRole('heading', { name: 'Set your zip code to see weather' })).toBeTruthy();
    expect(screen.queryByText('Locating…')).toBeNull();
    expect(screen.queryByText('No location')).toBeNull();
    expect(screen.queryByText('No Location')).toBeNull();
    expect(screen.getByText('Enter a zip code in the search field above to see weather.')).toBeTruthy();
    expect(screen.getByLabelText(/Zip code or coordinates/i)).toBeTruthy();
    expect(fetchExtendedWeather).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('shows a set-zip prompt when location resolution rejects and nothing is saved', async () => {
    weatherHelpersMock.resolveCoords.mockRejectedValue(new Error('denied'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Weather />);

    expect(await screen.findByRole('heading', { name: 'Set your zip code to see weather' })).toBeTruthy();
    expect(screen.queryByText('No location')).toBeNull();
    expect(screen.queryByText('No Location')).toBeNull();
    expect(screen.getByText('Enter a zip code in the search field above to see weather.')).toBeTruthy();
    expect(fetchExtendedWeather).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('shows a set-zip prompt on native when nothing is saved after fields hydrate', async () => {
    nativeState.isNative = true;

    render(<Weather />);

    expect(await screen.findByRole('heading', { name: 'Set your zip code to see weather' })).toBeTruthy();
    expect(screen.queryByText('Locating…')).toBeNull();
    expect(screen.queryByText('No location')).toBeNull();
    expect(screen.queryByText('No Location')).toBeNull();
    expect(weatherHelpersMock.resolveCoords).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetchExtendedWeather).not.toHaveBeenCalled();
  });

  it('keeps loading until fields hydrate before asking for a zip', () => {
    farmState.initialFetchComplete = false;

    render(<Weather />);

    expect(screen.getByText('Locating…')).toBeTruthy();
    expect(screen.getByText('Loading weather data…')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Set your zip code to see weather' })).toBeNull();
    expect(weatherHelpersMock.resolveCoords).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('loads weather for a saved zip', async () => {
    weatherHelpersMock.loadZip.mockReturnValue('64093');

    render(<Weather />);

    expect(await screen.findByText("Lee's Summit")).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Set your zip code to see weather' })).toBeNull();
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(screen.queryByText('Locating…')).toBeNull();
    expect(fetchExtendedWeather).toHaveBeenCalledWith('64093', expect.any(AbortSignal));
    expect(screen.getByPlaceholderText(/Enter zip code/i)).toHaveValue('64093');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('loads weather from field coordinates when no zip is saved', async () => {
    farmState.fields = [{ id: 'f1', lat: 39.1234, lng: -93.5678 }];

    render(<Weather />);

    expect(await screen.findByText("Lee's Summit")).toBeTruthy();
    expect(fetchExtendedWeather).toHaveBeenCalledWith('39.1234,-93.5678', expect.any(AbortSignal));
    expect(screen.queryByRole('heading', { name: 'Set your zip code to see weather' })).toBeNull();
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('loads weather from cached coordinates when no zip or field is saved', async () => {
    weatherHelpersMock.loadCachedWeatherCoords.mockReturnValue({ lat: 38.5, lon: -90.25, ts: Date.now() });

    render(<Weather />);

    expect(await screen.findByText("Lee's Summit")).toBeTruthy();
    expect(fetchExtendedWeather).toHaveBeenCalledWith('38.5,-90.25', expect.any(AbortSignal));
    expect(screen.queryByRole('heading', { name: 'Set your zip code to see weather' })).toBeNull();
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(screen.queryByText('Locating…')).toBeNull();
  });

  it('loads a cached fix before fields hydrate without asking for a zip', async () => {
    farmState.initialFetchComplete = false;
    weatherHelpersMock.loadCachedWeatherCoords.mockReturnValue({ lat: 38.5, lon: -90.25, ts: Date.now() });

    render(<Weather />);

    expect(await screen.findByText("Lee's Summit")).toBeTruthy();
    expect(fetchExtendedWeather).toHaveBeenCalledWith('38.5,-90.25', expect.any(AbortSignal));
    expect(screen.queryByRole('heading', { name: 'Set your zip code to see weather' })).toBeNull();
    expect(screen.queryByText('Set your zip code to see weather')).toBeNull();
    expect(weatherHelpersMock.resolveCoords).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
