/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SprayDecisionMatrix } from '../SprayDecisionMatrix';
import { evaluateSprayConditions, calculateDeltaT } from '@/lib/weatherHelpers';

describe('calculateDeltaT', () => {
  it('returns a reasonable Delta-T for typical spray conditions', () => {
    // 75°F, 50% RH is a common moderate condition
    const dt = calculateDeltaT(75, 50);
    expect(dt).toBeGreaterThan(2);
    expect(dt).toBeLessThan(12);
  });

  it('returns low Delta-T for cool humid conditions', () => {
    const dt = calculateDeltaT(60, 90);
    expect(dt).toBeLessThan(3);
  });

  it('returns high Delta-T for hot dry conditions', () => {
    const dt = calculateDeltaT(95, 20);
    expect(dt).toBeGreaterThan(8);
  });
});

describe('evaluateSprayConditions', () => {
  it('returns GO for ideal spray conditions', () => {
    const result = evaluateSprayConditions({ tempF: 75, humidity: 50, windSpeed: 6, precipProb: 10 });
    expect(result.overall).toBe('go');
  });

  it('returns WAIT for high wind', () => {
    const result = evaluateSprayConditions({ tempF: 75, humidity: 50, windSpeed: 15, precipProb: 10 });
    expect(result.overall).toBe('wait');
  });

  it('returns CAUTION for low wind / inversion risk', () => {
    const result = evaluateSprayConditions({ tempF: 75, humidity: 50, windSpeed: 1, precipProb: 10 });
    expect(result.overall).toBe('caution');
  });

  it('returns WAIT for high Delta-T', () => {
    const result = evaluateSprayConditions({ tempF: 100, humidity: 15, windSpeed: 6, precipProb: 10 });
    expect(result.overall).toBe('wait');
  });

  it('returns CAUTION for high rain chance', () => {
    const result = evaluateSprayConditions({ tempF: 75, humidity: 50, windSpeed: 6, precipProb: 50 });
    expect(result.overall).toBe('caution');
  });

  it('WAIT beats CAUTION and GO', () => {
    const result = evaluateSprayConditions({ tempF: 100, humidity: 15, windSpeed: 15, precipProb: 50 });
    expect(result.overall).toBe('wait');
  });
});

describe('SprayDecisionMatrix', () => {
  it('renders GO status for favorable conditions', () => {
    render(
      <SprayDecisionMatrix
        tempF={75}
        humidity={50}
        windSpeed={6}
        windDirection="SSE"
        precipProb={10}
      />
    );
    expect(screen.getByText(/GO/i)).toBeInTheDocument();
  });

  it('renders WAIT status for high wind', () => {
    render(
      <SprayDecisionMatrix
        tempF={75}
        humidity={50}
        windSpeed={15}
        windDirection="N"
        precipProb={10}
      />
    );
    expect(screen.getByText(/WAIT/i)).toBeInTheDocument();
  });
});
