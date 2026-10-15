import {
  Sun, CloudSun, Cloud, CloudRain, CloudDrizzle,
  CloudSnow, CloudLightning, CloudFog, Wind, Thermometer, Droplets
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { isNativePlatform, native } from '@/lib/native';

/** Regex for 5-digit or 5+4-digit US zip codes. */
export const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

/** Read the saved zip/coords string from localStorage. */
export function loadZip(userId?: string): string {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

/** Persist a zip/coords string to localStorage. */
export function saveZip(zip: string, userId?: string): void {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    localStorage.setItem(key, zip);
  } catch {
    /* ignore storage errors */
  }
}

/** Last GPS fix used for weather. `{lat,lon,ts}` as stored in localStorage. */
export type CachedWeatherCoords = { lat: number; lon: number; ts: number };

export type GeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type ResolveCoordsOptions = {
  /** User tapped refresh — request a live position even if the cache is fresh. */
  forceRefresh?: boolean;
  /**
   * Background timer. Never prompts. A live fix runs only when permission is
   * already granted and the cached fix is older than 6 hours.
   */
  passive?: boolean;
};

export const WEATHER_COORDS_CACHE_KEY = 'al_weather_coords';
/** Skip a live GPS read on load when the cached fix is newer than this. */
export const WEATHER_COORDS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Allow the browser to reuse a recent OS fix instead of a cold GPS lock. */
export const GEOLOCATION_MAX_AGE_MS = 30 * 60 * 1000;

function roundCoord(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Read the Permissions API geolocation state when the browser supports it.
 * Safari iOS often throws or omits `navigator.permissions` — never let that
 * reject the weather load.
 */
export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  try {
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions;
    if (!permissions || typeof permissions.query !== 'function') return 'unknown';
    const status = await permissions.query({ name: 'geolocation' });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Read the last weather GPS fix from localStorage. */
export function loadCachedWeatherCoords(): CachedWeatherCoords | null {
  try {
    const raw = localStorage.getItem(WEATHER_COORDS_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { lat, lon, ts } = parsed as Record<string, unknown>;
    if (!isFiniteCoord(lat) || !isFiniteCoord(lon) || !isFiniteCoord(ts)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || ts <= 0) return null;
    return { lat: roundCoord(lat), lon: roundCoord(lon), ts };
  } catch {
    return null;
  }
}

/** Persist a weather GPS fix. Swallows quota / private-mode storage errors. */
export function saveCachedWeatherCoords(coords: CachedWeatherCoords): void {
  try {
    const payload: CachedWeatherCoords = {
      lat: roundCoord(coords.lat),
      lon: roundCoord(coords.lon),
      ts: coords.ts,
    };
    localStorage.setItem(WEATHER_COORDS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage errors */
  }
}

function coordsFromCache(cached: CachedWeatherCoords): { lat: number; lng: number; locationString: string } {
  return {
    lat: cached.lat,
    lng: cached.lon,
    locationString: `${cached.lat},${cached.lon}`,
  };
}

function isCacheStale(cached: CachedWeatherCoords, now = Date.now()): boolean {
  return now - cached.ts > WEATHER_COORDS_CACHE_TTL_MS;
}

/**
 * Decide whether a web weather load should call `getCurrentPosition`.
 * Native Capacitor keeps requesting a fix whenever the GPS path is reached.
 */
export function shouldRequestWeatherGeolocation({
  forceRefresh,
  passive = false,
  permission,
  hasCache,
  cacheStale,
  nativePlatform,
}: {
  forceRefresh: boolean;
  passive?: boolean;
  permission: GeolocationPermissionState;
  hasCache: boolean;
  cacheStale: boolean;
  nativePlatform: boolean;
}): boolean {
  if (nativePlatform) return true;
  if (permission === 'denied') return false;
  if (forceRefresh) return true;
  // A timer must not surface the Safari prompt. Refresh only a known grant
  // whose cached fix is actually stale.
  if (passive) return permission === 'granted' && hasCache && cacheStale;
  if (!hasCache) return true;
  // Safari often reports "prompt" (or throws, which we map to "unknown")
  // even after the user allowed location once. A cache means we already have
  // a fix — do not re-prompt on load.
  if (permission === 'prompt' || permission === 'unknown') return false;
  return cacheStale;
}

/** Format the current time as 'h:mm AM/PM'. */
export function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Resolve the best available field coordinates from the fields array or
 * a saved zip/coords string. Returns 0,0 when no coords are available.
 */
export function fallbackToFields(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
): { lat: number; lng: number; locationString: string } {
  // Explicit saved selection always wins over field defaults.
  const match = savedZip.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), locationString: savedZip.trim() };
  }

  if (savedZip.trim()) return { lat: 0, lng: 0, locationString: savedZip.trim() };

  // First field with coords
  const field = fields.find(f => f.lat != null && f.lng != null);
  if (field && field.lat != null && field.lng != null) {
    const lat = Math.round(field.lat * 10000) / 10000;
    const lng = Math.round(field.lng * 10000) / 10000;
    return { lat, lng, locationString: `${lat},${lng}` };
  }

  // No coords available — return 0s, locationString will be the zip for weather API
  return { lat: 0, lng: 0, locationString: savedZip || '' };
}

function requestWeatherPosition(
  fallback: { lat: number; lng: number; locationString: string },
  cached: CachedWeatherCoords | null,
): Promise<{ lat: number; lng: number; locationString: string }> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(cached ? coordsFromCache(cached) : fallback);
    }, 5000);

    const options: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 4000,
    };
    if (!isNativePlatform()) {
      options.maximumAge = GEOLOCATION_MAX_AGE_MS;
    }

    native.geolocation.getCurrentPosition(options)
      .then((pos) => {
        clearTimeout(timeoutId);
        const lat = roundCoord(pos.coords.latitude);
        const lng = roundCoord(pos.coords.longitude);
        saveCachedWeatherCoords({ lat, lon: lng, ts: Date.now() });
        resolve({ lat, lng, locationString: `${lat},${lng}` });
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(cached ? coordsFromCache(cached) : fallback);
      });
  });
}

/**
 * Resolve coordinates for weather + radar.
 *
 * Priority:
 *   1. Saved zip/coords or field coordinates (via `fallbackToFields`)
 *   2. Cached GPS fix, then a live browser / native GPS read
 *
 * GPS is only attempted when no saved location or field coords exist.
 * On web, load does not call GPS when a cached fix exists and permission is
 * not a confirmed grant (prompt, denied, or Permissions API missing/throwing).
 * Safari iOS otherwise re-prompts on almost every launch. Native Capacitor
 * still requests a fix whenever this GPS path is reached.
 */
export async function resolveCoords(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
  options?: ResolveCoordsOptions,
): Promise<{ lat: number; lng: number; locationString: string }> {
  const fallback = fallbackToFields(fields, savedZip);
  if ((fallback.lat !== 0 && fallback.lng !== 0) || savedZip.trim()) {
    return fallback;
  }

  const cached = loadCachedWeatherCoords();
  const nativePlatform = isNativePlatform();
  const permission = nativePlatform ? 'unknown' : await queryGeolocationPermission();
  const requestGps = shouldRequestWeatherGeolocation({
    forceRefresh: options?.forceRefresh === true,
    passive: options?.passive === true,
    permission,
    hasCache: cached != null,
    cacheStale: cached ? isCacheStale(cached) : true,
    nativePlatform,
  });

  if (!requestGps) {
    return cached ? coordsFromCache(cached) : fallback;
  }

  return requestWeatherPosition(fallback, cached);
}

/**
 * Find a field whose coordinates match the given lat/lng within a small
 * tolerance (0.0001 ≈ 11 m). Returns the field id or a generic fallback.
 */
export function matchFieldByCoords(
  fields: { id: string; lat: number | null; lng: number | null }[],
  lat: number,
  lng: number,
): string | null {
  const matched = fields.find(
    f =>
      f.lat != null &&
      f.lng != null &&
      Math.abs(f.lat - lat) < 0.0001 &&
      Math.abs(f.lng - lng) < 0.0001,
  );
  return matched?.id ?? null;
}

/** Map Visual Crossing icon/conditions to a Lucide icon component */
export function getWeatherLucideIcon(vcIcon?: string, precipProb?: number, isRainingNow?: boolean): LucideIcon {
  if (isRainingNow) return CloudRain;
  if (!vcIcon) return precipProb && precipProb > 60 ? CloudDrizzle : Sun;
  if (vcIcon.includes('thunder') || vcIcon.includes('lightning')) return CloudLightning;
  if (vcIcon.includes('snow')) return CloudSnow;
  if (vcIcon.includes('rain')) return CloudRain;
  if (vcIcon.includes('fog')) return CloudFog;
  if (vcIcon.includes('wind')) return Wind;
  if (vcIcon.includes('partly-cloudy')) return CloudSun;
  if (vcIcon.includes('cloudy') || vcIcon.includes('overcast')) return Cloud;
  if (precipProb && precipProb > 60) return CloudDrizzle;
  return Sun;
}

/** Return Tailwind gradient classes based on weather conditions */
export function getConditionGradient(vcIcon?: string, isRainingNow?: boolean): string {
  if (isRainingNow || (vcIcon && (vcIcon.includes('rain') || vcIcon.includes('drizzle')))) return 'from-blue-500/10 to-blue-600/5';
  if (vcIcon?.includes('snow')) return 'from-slate-300/10 to-blue-200/5';
  if (vcIcon?.includes('thunder') || vcIcon?.includes('lightning')) return 'from-purple-500/10 to-slate-600/5';
  if (vcIcon?.includes('fog')) return 'from-slate-400/8 to-slate-500/5';
  if (vcIcon?.includes('partly-cloudy')) return 'from-amber-400/5 to-blue-400/5';
  if (vcIcon?.includes('cloudy') || vcIcon?.includes('overcast')) return 'from-slate-400/10 to-slate-500/5';
  return 'from-amber-400/10 to-orange-500/5';
}

/** Get degrees of rotation for wind direction arrow */
export function getWindRotation(dir: string): number {
  const angles: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
  };
  return angles[dir] ?? 0;
}

export type SprayStatus = 'go' | 'caution' | 'wait';

/**
 * Wind drift warning threshold (mph). The named constant for spray wind-speed
 * alerts — imported by the conditions step and in-cab quick UI so there is a
 * single source of truth. (AGENTS.md names this threshold.)
 */
export const WIND_ALERT_MPH = 10;
const INVERSION_MPH = 3;
const PRECIP_CAUTION_PCT = 30;
const DELTA_T_MIN_GO = 2;
const DELTA_T_MAX_GO = 8;
const DELTA_T_MAX_CAUTION = 10;

function fToC(f: number): number {
  return (f - 32) * 5 / 9;
}

// Stull (2011) formula for wet-bulb temperature (input/output Celsius)
function wetBulbC(tempC: number, rh: number): number {
  return tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;
}

export function calculateDeltaT(tempF: number, humidity: number): number {
  const tempC = fToC(tempF);
  const wetC = wetBulbC(tempC, humidity);
  const delta = tempC - wetC;
  return Math.round(delta * 10) / 10;
}

export function evaluateSprayConditions({
  windSpeed,
  precipProb,
  tempF,
  humidity
}: {
  windSpeed: number;
  precipProb: number;
  tempF: number;
  humidity: number;
}): {
  overall: SprayStatus;
  factors: { label: string; value: string; status: SprayStatus; note: string; icon: React.ElementType }[];
} {
  const factors: { label: string; value: string; status: SprayStatus; note: string; icon: React.ElementType }[] = [];

  // Wind speed
  let windStatus: SprayStatus = 'go';
  let windNote = `${windSpeed} mph is in the acceptable ${INVERSION_MPH}-${WIND_ALERT_MPH} mph range.`;
  if (windSpeed > WIND_ALERT_MPH) {
    windStatus = 'wait';
    windNote = `Wind ${windSpeed} mph exceeds ${WIND_ALERT_MPH} mph drift warning.`;
  } else if (windSpeed < INVERSION_MPH) {
    windStatus = 'caution';
    windNote = `Wind ${windSpeed} mph below ${INVERSION_MPH} mph — inversion risk.`;
  }
  factors.push({
    label: 'Wind Speed',
    value: `${windSpeed} mph`,
    status: windStatus,
    note: windNote,
    icon: Wind
  });

  // Delta-T
  const deltaT = calculateDeltaT(tempF, humidity);
  let deltaStatus: SprayStatus = 'go';
  let deltaNote = `ΔT ${deltaT} is in the ideal ${DELTA_T_MIN_GO}-${DELTA_T_MAX_GO} range.`;
  if (deltaT > DELTA_T_MAX_CAUTION) {
    deltaStatus = 'wait';
    deltaNote = `ΔT ${deltaT} is high — droplets may evaporate too quickly.`;
  } else if (deltaT > DELTA_T_MAX_GO) {
    deltaStatus = 'caution';
    deltaNote = `ΔT ${deltaT} is elevated — watch for evaporation.`;
  } else if (deltaT < DELTA_T_MIN_GO) {
    deltaStatus = 'wait';
    deltaNote = `ΔT ${deltaT} is low — strong inversion / settling risk.`;
  }
  factors.push({
    label: 'Delta-T',
    value: `${deltaT}`,
    status: deltaStatus,
    note: deltaNote,
    icon: Thermometer
  });

  // Rain chance
  let rainStatus: SprayStatus = 'go';
  let rainNote = `${precipProb}% chance of rain — acceptable.`;
  if (precipProb > PRECIP_CAUTION_PCT) {
    rainStatus = 'caution';
    rainNote = `${precipProb}% chance of rain — risk of washoff.`;
  }
  factors.push({
    label: 'Rain Chance',
    value: `${precipProb}%`,
    status: rainStatus,
    note: rainNote,
    icon: CloudRain
  });

  // Humidity (informational — contributes to Delta-T)
  let humidStatus: SprayStatus = 'go';
  let humidNote = `${humidity}% relative humidity.`;
  if (humidity < 20) {
    humidStatus = 'caution';
    humidNote = `${humidity}% humidity — very dry, increased evaporation risk.`;
  }
  factors.push({
    label: 'Humidity',
    value: `${humidity}%`,
    status: humidStatus,
    note: humidNote,
    icon: Droplets
  });

  const overall = factors.reduce<SprayStatus>((worst, f) => {
    if (worst === 'wait' || f.status === 'wait') return 'wait';
    if (worst === 'caution' || f.status === 'caution') return 'caution';
    return 'go';
  }, 'go');

  return { overall, factors };
}


