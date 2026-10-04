/**
 * App-level preferences: country, locale, and unit system.
 *
 * Introduced for the Australia pilot (Oct 2026). Defaults preserve the
 * existing US behavior exactly — nothing in the UI reads these yet, so this
 * commit is behavior-invisible. Country-gated features (metric units,
 * AU compliance templates, paddock terminology) will read from here.
 *
 * Persisted per-user in localStorage via storageUtils (offline-first, like
 * useAuth's farm/season keys). A Supabase profiles-column sync is a
 * follow-up; device-local is correct for locale/unit preferences.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { loadFromStorage, saveToStorage } from '@/store/storageUtils';

export type CountryCode = 'US' | 'AU';
export type LocaleCode = 'en-US' | 'en-AU';
export type UnitSystem = 'imperial' | 'metric';

export interface AppPreferences {
  country: CountryCode;
  locale: LocaleCode;
  unitSystem: UnitSystem;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  country: 'US',
  locale: 'en-US',
  unitSystem: 'imperial',
};

const COUNTRIES: readonly CountryCode[] = ['US', 'AU'];
const LOCALES: readonly LocaleCode[] = ['en-US', 'en-AU'];
const UNIT_SYSTEMS: readonly UnitSystem[] = ['imperial', 'metric'];

const STORAGE_KEY = 'al_app_prefs';

/**
 * Validates unknown input (e.g. from localStorage) field by field, falling
 * back to defaults for anything missing or invalid. Pure — unit-tested
 * directly without React.
 */
export function parseAppPreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_APP_PREFERENCES };
  const v = value as Partial<Record<keyof AppPreferences, unknown>>;
  return {
    country: COUNTRIES.includes(v.country as CountryCode)
      ? (v.country as CountryCode)
      : DEFAULT_APP_PREFERENCES.country,
    locale: LOCALES.includes(v.locale as LocaleCode)
      ? (v.locale as LocaleCode)
      : DEFAULT_APP_PREFERENCES.locale,
    unitSystem: UNIT_SYSTEMS.includes(v.unitSystem as UnitSystem)
      ? (v.unitSystem as UnitSystem)
      : DEFAULT_APP_PREFERENCES.unitSystem,
  };
}

export function useAppPreferences(userId?: string | null) {
  // Copy the default so no consumer can mutate the shared object.
  const [preferences, setPreferencesState] = useState<AppPreferences>(() => ({ ...DEFAULT_APP_PREFERENCES }));
  const preferencesRef = useRef(preferences);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Reload preferences when the signed-in user changes.
  useEffect(() => {
    const loaded = parseAppPreferences(loadFromStorage<AppPreferences>(STORAGE_KEY, DEFAULT_APP_PREFERENCES, userId));
    preferencesRef.current = loaded;
    setPreferencesState(loaded);
  }, [userId]);

  const applyUpdate = useCallback((partial: Partial<AppPreferences>) => {
    const validated = parseAppPreferences({ ...preferencesRef.current, ...partial });
    preferencesRef.current = validated;
    saveToStorage(STORAGE_KEY, validated, userIdRef.current);
    setPreferencesState(validated);
  }, []);

  const setPreferences = useCallback(
    (next: AppPreferences) => applyUpdate(next),
    [applyUpdate],
  );

  const updatePreferences = useCallback(
    (partial: Partial<AppPreferences>) => applyUpdate(partial),
    [applyUpdate],
  );

  return { preferences, setPreferences, updatePreferences };
}
