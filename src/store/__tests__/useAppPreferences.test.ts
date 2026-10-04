import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_PREFERENCES, parseAppPreferences } from '../useAppPreferences';

describe('parseAppPreferences', () => {
  it('returns US defaults for null, undefined, and non-objects', () => {
    expect(parseAppPreferences(null)).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences(undefined)).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences('en-AU')).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences(42)).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it('keeps the existing US behavior as the default', () => {
    expect(DEFAULT_APP_PREFERENCES).toEqual({
      country: 'US',
      locale: 'en-US',
      unitSystem: 'imperial',
    });
  });

  it('passes through a fully valid AU preference set', () => {
    expect(
      parseAppPreferences({ country: 'AU', locale: 'en-AU', unitSystem: 'metric' }),
    ).toEqual({ country: 'AU', locale: 'en-AU', unitSystem: 'metric' });
  });

  it('falls back field-by-field so one bad value cannot corrupt the rest', () => {
    expect(
      parseAppPreferences({ country: 'BR', locale: 'en-AU', unitSystem: 'metric' }),
    ).toEqual({ country: 'US', locale: 'en-AU', unitSystem: 'metric' });
  });

  it('fills missing fields with defaults', () => {
    expect(parseAppPreferences({})).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences({ country: 'AU' })).toEqual({
      country: 'AU',
      locale: 'en-US',
      unitSystem: 'imperial',
    });
  });

  it('ignores extra fields instead of rejecting the record', () => {
    expect(
      parseAppPreferences({ country: 'AU', locale: 'en-AU', unitSystem: 'metric', theme: 'dark' }),
    ).toEqual({ country: 'AU', locale: 'en-AU', unitSystem: 'metric' });
  });
});
