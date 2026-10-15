import { describe, expect, it } from 'vitest';

import { assertCapacitorWeatherProxy, bundledVisualCrossingKey } from './weatherBuildConfig';

describe('bundledVisualCrossingKey', () => {
  it('returns the dev key and an empty string for every non-dev build', () => {
    expect(bundledVisualCrossingKey(true, '  "dev-key"  ')).toBe('dev-key');
    expect(bundledVisualCrossingKey(false, 'native-secret')).toBe('');
    expect(bundledVisualCrossingKey(false, undefined)).toBe('');
  });
});

describe('assertCapacitorWeatherProxy', () => {
  it('fails a capacitor build when the proxy URL is missing', () => {
    expect(() => assertCapacitorWeatherProxy('capacitor', '')).toThrow(/VITE_WEATHER_PROXY_URL/);
    expect(() => assertCapacitorWeatherProxy('capacitor', '   ')).toThrow(/VITE_WEATHER_PROXY_URL/);
    expect(() => assertCapacitorWeatherProxy('production', '')).not.toThrow();
    expect(() => assertCapacitorWeatherProxy('capacitor', 'https://acreledger.vercel.app')).not.toThrow();
  });
});
