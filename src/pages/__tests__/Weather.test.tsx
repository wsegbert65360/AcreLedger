/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({ session: null, fields: [] }),
}));

vi.mock('@/lib/native', () => ({
  native: { geolocation: { getCurrentPosition: vi.fn() } },
}));

vi.mock('@/services/WeatherService', () => ({
  WeatherService: { fetchExtendedWeather: vi.fn() },
}));

vi.mock('@/services/RainService', () => ({
  RainService: { fetchComprehensiveRainfall: vi.fn() },
}));

vi.mock('@/components/weather/ForecastGrid', () => ({ default: () => null }));
vi.mock('@/components/weather/RadarEmbed', () => ({ default: () => null }));
vi.mock('@/components/weather/SprayDecisionMatrix', () => ({ SprayDecisionMatrix: () => null }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => null }));

import { CurrentConditionsCard } from '../Weather';
import type { ExtendedWeatherData } from '@/types/weather';

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
});
