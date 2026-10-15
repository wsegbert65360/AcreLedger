import { describe, expect, it } from 'vitest';

import { formatWeatherLatLng, normalizeWeatherLocation, roundWeatherLatLng } from './weatherCoords';

describe('formatWeatherLatLng', () => {
  it('rounds southern-hemisphere high-precision coords to 4 decimals', () => {
    expect(formatWeatherLatLng(-33.12345678, 151.1)).toBe('-33.1235,151.1000');
    expect(roundWeatherLatLng(-33.12345678, 151.1)).toEqual({ lat: -33.1235, lng: 151.1 });
  });

  it('keeps already-rounded coords at 4 decimals', () => {
    expect(formatWeatherLatLng(38.4654, -93.5442)).toBe('38.4654,-93.5442');
  });
});

describe('normalizeWeatherLocation', () => {
  it('rounds a lat,lng string and leaves zip/address unchanged', () => {
    expect(normalizeWeatherLocation('-33.12345678,151.1')).toBe('-33.1235,151.1000');
    expect(normalizeWeatherLocation('40.12, -93.5')).toBe('40.1200,-93.5000');
    expect(normalizeWeatherLocation('72301')).toBe('72301');
    expect(normalizeWeatherLocation('New York')).toBe('New York');
  });
});
