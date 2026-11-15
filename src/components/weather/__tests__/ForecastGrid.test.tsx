/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ForecastDay } from '@/types/weather';

import ForecastGrid from '../ForecastGrid';

function forecastDay(date: string, rainChance: number | null): ForecastDay {
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
  it('renders a zero rain chance as 0%', () => {
    render(<ForecastGrid days={[forecastDay('2026-08-27', 0)]} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('No rain expected')).toBeInTheDocument();
  });

  it('renders a missing rain chance as a dash instead of 0%', () => {
    render(<ForecastGrid days={[forecastDay('2026-08-27', null)]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('Rain chance unavailable')).toBeInTheDocument();
  });

  it('uses distinct rain treatments below and at the 40 percent threshold', () => {
    render(
      <ForecastGrid
        days={[
          forecastDay('2026-08-27', 39),
          forecastDay('2026-08-28', 40),
        ]}
      />,
    );

    expect(screen.getByText('39%').closest('[data-rain-tier]')).toHaveAttribute('data-rain-tier', 'low');
    expect(screen.getByText('40%').closest('[data-rain-tier]')).toHaveAttribute('data-rain-tier', 'high');
  });

  it('renders forecast labels at readable text sizes', () => {
    render(<ForecastGrid days={[forecastDay('2026-08-27', 20)]} />);

    expect(screen.getByText('Today').className).toContain('text-sm');
    expect(screen.getByText('20%').className).toContain('text-sm');
    expect(screen.getByText('78°').className).toContain('text-base');
    // The sky condition is carried by the icon, with the words kept for screen readers.
    expect(screen.getByText('Partly cloudy').className).toContain('sr-only');
  });
});
