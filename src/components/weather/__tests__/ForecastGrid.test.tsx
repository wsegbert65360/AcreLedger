/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ForecastDay } from '@/types/weather';

import ForecastGrid from '../ForecastGrid';

function forecastDay(date: string, rainChance: number): ForecastDay {
  return {
    date,
    tempHighF: 78,
    tempLowF: 61,
    rainChance,
    precipIn: 0,
    conditions: 'Partly cloudy',
    icon: 'partly-cloudy-day',
    windSpeed: 7,
  };
}

describe('ForecastGrid', () => {
  it('uses distinct rain treatments below and at the 40 percent threshold', () => {
    render(
      <ForecastGrid
        days={[
          forecastDay('2026-08-27', 39),
          forecastDay('2026-08-28', 40),
        ]}
      />,
    );

    expect(screen.getByText('39% rain').closest('[data-rain-tier]')).toHaveAttribute('data-rain-tier', 'low');
    expect(screen.getByText('40% rain').closest('[data-rain-tier]')).toHaveAttribute('data-rain-tier', 'high');
  });

  it('renders forecast labels at readable text sizes', () => {
    render(<ForecastGrid days={[forecastDay('2026-08-27', 20)]} />);

    expect(screen.getByText('TOD').className).toContain('text-sm');
    expect(screen.getByText('Partly cloudy').className).toContain('text-xs');
    expect(screen.getByText('78°').className).toContain('text-base');
  });
});
