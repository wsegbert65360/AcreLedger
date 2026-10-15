import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AI_DAILY_CAP,
  DEFAULT_WEATHER_DAILY_CAP,
  resolveDailyCap,
} from '../../server/providerDailyUsage';

describe('provider daily caps', () => {
  it('uses the documented defaults when env is empty or invalid', () => {
    expect(DEFAULT_WEATHER_DAILY_CAP).toBe(2000);
    expect(DEFAULT_AI_DAILY_CAP).toBe(500);
    expect(resolveDailyCap(undefined, DEFAULT_WEATHER_DAILY_CAP)).toBe(2000);
    expect(resolveDailyCap('  ', DEFAULT_AI_DAILY_CAP)).toBe(500);
    expect(resolveDailyCap('0', DEFAULT_WEATHER_DAILY_CAP)).toBe(2000);
    expect(resolveDailyCap('-1', DEFAULT_AI_DAILY_CAP)).toBe(500);
    expect(resolveDailyCap('abc', DEFAULT_WEATHER_DAILY_CAP)).toBe(2000);
  });

  it('accepts a positive integer cap from env', () => {
    expect(resolveDailyCap('3500', DEFAULT_WEATHER_DAILY_CAP)).toBe(3500);
    expect(resolveDailyCap('75', DEFAULT_AI_DAILY_CAP)).toBe(75);
  });
});
