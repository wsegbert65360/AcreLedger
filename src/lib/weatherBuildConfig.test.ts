import { describe, expect, it } from 'vitest';

import { assertCapacitorWeatherProxy } from './weatherBuildConfig';

describe('assertCapacitorWeatherProxy', () => {
  it('fails a capacitor build when the proxy URL is missing', () => {
    expect(() => assertCapacitorWeatherProxy('capacitor', '')).toThrow(/VITE_WEATHER_PROXY_URL/);
    expect(() => assertCapacitorWeatherProxy('capacitor', '   ')).toThrow(/VITE_WEATHER_PROXY_URL/);
    expect(() => assertCapacitorWeatherProxy('production', '')).not.toThrow();
    expect(() => assertCapacitorWeatherProxy('capacitor', 'https://acreledger.vercel.app')).not.toThrow();
  });
});
