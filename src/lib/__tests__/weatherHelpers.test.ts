/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sun, CloudRain, CloudSun, Cloud } from 'lucide-react';

import {
  ZIP_REGEX,
  parseWeatherLocationInput,
  loadZip,
  saveZip,
  formatTime,
  fallbackToFields,
  resolveCoords,
  getWeatherLucideIcon,
  getConditionGradient,
  matchFieldByCoords,
  queryGeolocationPermission,
  loadCachedWeatherCoords,
  saveCachedWeatherCoords,
  shouldRequestWeatherGeolocation,
  WEATHER_COORDS_CACHE_KEY,
  WEATHER_COORDS_CACHE_TTL_MS,
  GEOLOCATION_MAX_AGE_MS,
} from '../weatherHelpers';

const nativeState = vi.hoisted(() => ({ isNative: false }));

vi.mock('@/lib/native', () => ({
  native: {
    geolocation: {
      getCurrentPosition: vi.fn(),
    },
  },
  isNativePlatform: () => nativeState.isNative,
}));

import { native } from '@/lib/native';

function seedWeatherCoordsCache(coords: { lat: number; lon: number; ts: number }): void {
  localStorage.setItem(WEATHER_COORDS_CACHE_KEY, JSON.stringify(coords));
}

function mockGeolocationPermission(
  state: 'granted' | 'denied' | 'prompt' | 'missing' | 'throw',
): void {
  if (state === 'missing') {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    });
    return;
  }
  if (state === 'throw') {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: () => {
          throw new Error('Safari does not support geolocation permission queries');
        },
      },
    });
    return;
  }
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn().mockResolvedValue({ state }),
    },
  });
}

describe('weatherHelpers', () => {
  const originalPermissions = navigator.permissions;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    nativeState.isNative = false;
    mockGeolocationPermission('missing');
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: originalPermissions,
    });
  });

  describe('ZIP_REGEX', () => {
    it('should validate 5-digit zip codes', () => {
      expect(ZIP_REGEX.test('12345')).toBe(true);
      expect(ZIP_REGEX.test('12345-6789')).toBe(true);
      expect(ZIP_REGEX.test('1234')).toBe(false);
      expect(ZIP_REGEX.test('123456')).toBe(false);
      expect(ZIP_REGEX.test('abcde')).toBe(false);
    });
  });

  describe('loadZip and saveZip', () => {
    it('should load and save zip without userId', () => {
      saveZip('12345');
      expect(loadZip()).toBe('12345');
    });

    it('should load and save zip with userId', () => {
      const userId = 'user-123';
      saveZip('98765', userId);
      expect(loadZip(userId)).toBe('98765');
      expect(loadZip()).toBe(''); // Default key is empty
    });

    it('should handle errors gracefully', () => {
      const mockGetItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(loadZip()).toBe('');
      mockGetItem.mockRestore();
    });
  });

  describe('formatTime', () => {
    it('should format current time as h:mm AM/PM', () => {
      const formatted = formatTime();
      expect(formatted).toMatch(/^\d{1,2}:\d{2}\s*(AM|PM)$/i);
    });
  });

  describe('fallbackToFields', () => {
    it('should return the first field coordinates if present', () => {
      const fields = [
        { lat: null, lng: null },
        { lat: 41.12345, lng: -85.12345 },
      ];
      const result = fallbackToFields(fields, '');
      expect(result).toEqual({
        lat: 41.1235,
        lng: -85.1234,
        locationString: '41.1235,-85.1234',
      });
    });

    it('should parse saved zip if it is coordinate format', () => {
      const result = fallbackToFields([], '40.7128, -74.0060');
      expect(result).toEqual({
        lat: 40.7128,
        lng: -74.006,
        locationString: '40.7128, -74.0060',
      });
    });

    it('should return locationString as zip if coords not found', () => {
      const result = fallbackToFields([], '12345');
      expect(result).toEqual({
        lat: 0,
        lng: 0,
        locationString: '12345',
      });
    });
  });

  describe('resolveCoords', () => {
    it('should resolve immediately if fallback is coordinate-based or zip exists', async () => {
      const fields = [{ lat: 40.7128, lng: -74.006 }];
      const result = await resolveCoords(fields, '');
      expect(result.lat).toBe(40.7128);
      expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('should attempt GPS if no fallback/zip exists', async () => {
      (native.geolocation.getCurrentPosition as any).mockResolvedValue({
        coords: {
          latitude: 35.12345,
          longitude: -90.12345,
        },
      });

      const result = await resolveCoords([], '');
      expect(native.geolocation.getCurrentPosition).toHaveBeenCalled();
      expect(result).toEqual({
        lat: 35.1235,
        lng: -90.1234,
        locationString: '35.1235,-90.1234',
      });
    });

    it('should fallback if GPS fails', async () => {
      (native.geolocation.getCurrentPosition as any).mockRejectedValue(new Error('GPS Error'));
      const result = await resolveCoords([], '12345');
      expect(result).toEqual({
        lat: 0,
        lng: 0,
        locationString: '12345',
      });
    });

    it('does not call geolocation on load when cache exists and permission is prompt', async () => {
      mockGeolocationPermission('prompt');
      seedWeatherCoordsCache({ lat: 35.1235, lon: -90.1234, ts: Date.now() });

      const result = await resolveCoords([], '');

      expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(result).toEqual({
        lat: 35.1235,
        lng: -90.1234,
        locationString: '35.1235,-90.1234',
      });
    });

    it('calls geolocation when the cache is stale and permission is granted', async () => {
      mockGeolocationPermission('granted');
      seedWeatherCoordsCache({
        lat: 35.1,
        lon: -90.1,
        ts: Date.now() - WEATHER_COORDS_CACHE_TTL_MS - 1000,
      });
      (native.geolocation.getCurrentPosition as any).mockResolvedValue({
        coords: { latitude: 41.12345, longitude: -85.12345 },
      });

      const result = await resolveCoords([], '');

      expect(native.geolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          enableHighAccuracy: false,
          timeout: 4000,
          maximumAge: GEOLOCATION_MAX_AGE_MS,
        }),
      );
      expect(result).toEqual({
        lat: 41.1235,
        lng: -85.1234,
        locationString: '41.1235,-85.1234',
      });
      expect(loadCachedWeatherCoords()).toEqual({
        lat: 41.1235,
        lon: -85.1234,
        ts: expect.any(Number),
      });
    });

    it('calls geolocation on explicit refresh even with a fresh cache', async () => {
      mockGeolocationPermission('prompt');
      seedWeatherCoordsCache({ lat: 35.1235, lon: -90.1234, ts: Date.now() });
      (native.geolocation.getCurrentPosition as any).mockResolvedValue({
        coords: { latitude: 40.0, longitude: -74.0 },
      });

      const result = await resolveCoords([], '', { forceRefresh: true });

      expect(native.geolocation.getCurrentPosition).toHaveBeenCalled();
      expect(result.locationString).toBe('40,-74');
    });

    it('does not call geolocation on a passive timer when there is no cache', async () => {
      mockGeolocationPermission('prompt');

      const result = await resolveCoords([], '', { passive: true });

      expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(result.locationString).toBe('');
    });

    it('calls geolocation on a passive timer when the cache is stale and permission is granted', async () => {
      mockGeolocationPermission('granted');
      seedWeatherCoordsCache({
        lat: 35.1,
        lon: -90.1,
        ts: Date.now() - WEATHER_COORDS_CACHE_TTL_MS - 1000,
      });
      (native.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mockResolvedValue({
        coords: { latitude: 41.2, longitude: -85.2 },
      });

      await resolveCoords([], '', { passive: true });

      expect(native.geolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.objectContaining({ maximumAge: GEOLOCATION_MAX_AGE_MS }),
      );
    });

    it('calls geolocation when no cache exists', async () => {
      mockGeolocationPermission('prompt');
      (native.geolocation.getCurrentPosition as any).mockResolvedValue({
        coords: { latitude: 35.12345, longitude: -90.12345 },
      });

      const result = await resolveCoords([], '');

      expect(native.geolocation.getCurrentPosition).toHaveBeenCalled();
      expect(result.locationString).toBe('35.1235,-90.1234');
    });

    it('does not call geolocation when the permissions API is missing and a cache exists', async () => {
      mockGeolocationPermission('missing');
      seedWeatherCoordsCache({ lat: 35.1235, lon: -90.1234, ts: Date.now() });

      const result = await resolveCoords([], '');

      expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(result.locationString).toBe('35.1235,-90.1234');
    });

    it('does not call geolocation when permissions.query throws and a cache exists', async () => {
      mockGeolocationPermission('throw');
      seedWeatherCoordsCache({ lat: 35.1235, lon: -90.1234, ts: Date.now() });

      const result = await resolveCoords([], '');

      expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(result.locationString).toBe('35.1235,-90.1234');
    });

    it('uses cache silently when permission is denied', async () => {
      mockGeolocationPermission('denied');
      seedWeatherCoordsCache({ lat: 35.1235, lon: -90.1234, ts: Date.now() });

      const result = await resolveCoords([], '', { forceRefresh: true });

      expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(result.locationString).toBe('35.1235,-90.1234');
    });

    it('still requests GPS on native even with a prompt-state cache', async () => {
      nativeState.isNative = true;
      mockGeolocationPermission('prompt');
      seedWeatherCoordsCache({ lat: 35.1235, lon: -90.1234, ts: Date.now() });
      (native.geolocation.getCurrentPosition as any).mockResolvedValue({
        coords: { latitude: 41.5, longitude: -85.5 },
      });

      const result = await resolveCoords([], '');

      expect(native.geolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.objectContaining({ enableHighAccuracy: false, timeout: 4000 }),
      );
      expect((native.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('maximumAge');
      expect(result.locationString).toBe('41.5,-85.5');
    });
  });

  describe('queryGeolocationPermission', () => {
    it('returns unknown when the permissions API is missing', async () => {
      mockGeolocationPermission('missing');
      await expect(queryGeolocationPermission()).resolves.toBe('unknown');
    });

    it('returns unknown when permissions.query throws', async () => {
      mockGeolocationPermission('throw');
      await expect(queryGeolocationPermission()).resolves.toBe('unknown');
    });

    it('returns unknown when permissions.query rejects', async () => {
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query: () => Promise.reject(new Error('not supported')) },
      });
      await expect(queryGeolocationPermission()).resolves.toBe('unknown');
    });

    it('returns the queried state when available', async () => {
      mockGeolocationPermission('granted');
      await expect(queryGeolocationPermission()).resolves.toBe('granted');
    });
  });

  describe('weather coords cache', () => {
    it('round-trips coords through localStorage', () => {
      saveCachedWeatherCoords({ lat: 35.12345, lon: -90.12345, ts: 1_700_000_000_000 });
      expect(loadCachedWeatherCoords()).toEqual({
        lat: 35.1235,
        lon: -90.1234,
        ts: 1_700_000_000_000,
      });
    });

    it('returns null when storage throws or JSON is invalid', () => {
      localStorage.setItem(WEATHER_COORDS_CACHE_KEY, '{not-json');
      expect(loadCachedWeatherCoords()).toBeNull();

      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });
      expect(loadCachedWeatherCoords()).toBeNull();
      spy.mockRestore();
    });
  });

  describe('shouldRequestWeatherGeolocation', () => {
    it('never requests on web when permission is prompt and a cache exists', () => {
      expect(shouldRequestWeatherGeolocation({
        forceRefresh: false,
        permission: 'prompt',
        hasCache: true,
        cacheStale: true,
        nativePlatform: false,
      })).toBe(false);
    });
  });

  describe('getWeatherLucideIcon', () => {
    it('should return CloudRain if isRainingNow is true', () => {
      expect(getWeatherLucideIcon('clear-day', undefined, true)).toBe(CloudRain);
    });

    it('should return Sun for clear conditions', () => {
      expect(getWeatherLucideIcon('clear-day', 10, false)).toBe(Sun);
    });

    it('should return CloudSun for partly-cloudy', () => {
      expect(getWeatherLucideIcon('partly-cloudy-day', 10, false)).toBe(CloudSun);
    });

    it('should return Cloud for cloudy', () => {
      expect(getWeatherLucideIcon('cloudy', 10, false)).toBe(Cloud);
    });
  });

  describe('getConditionGradient', () => {
    it('should return rain gradient if raining', () => {
      expect(getConditionGradient('clear-day', true)).toContain('from-blue-500/10');
    });

    it('should return default gradient for clear conditions', () => {
      expect(getConditionGradient('clear-day', false)).toContain('from-amber-400/10');
    });
  });

  describe('matchFieldByCoords', () => {
    it('returns null when no field matches', () => {
      expect(matchFieldByCoords([], 40.1, -90.2)).toBeNull();
    });

    it('returns the matching field id', () => {
      const fields = [{ id: 'field-1', lat: 40.1234, lng: -90.5678 }];
      expect(matchFieldByCoords(fields, 40.1234, -90.5678)).toBe('field-1');
    });
  });

  it.each(['64093', '40.7128,-74.0060'])('preserves saved selection %s over field defaults', async saved => {
    const result = await resolveCoords([{ lat: 39.1234, lng: -93.5678 }], saved);
    expect(result.locationString).toBe(saved);
    expect(native.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

});

describe('parseWeatherLocationInput', () => {
  it.each(['', '   '])('rejects empty input %j', raw => {
    expect(parseWeatherLocationInput(raw)).toEqual({ ok: false, error: 'Enter a zip code or coordinates' });
  });
  it.each(['72301', '12345-6789'])('accepts ZIP %s', value => {
    expect(parseWeatherLocationInput(value)).toEqual({ ok: true, value, coords: null });
  });
  it('accepts coordinates', () => {
    expect(parseWeatherLocationInput(' 35.1,-90.2 ')).toEqual({ ok: true, value: '35.1,-90.2', coords: { lat: 35.1, lng: -90.2 } });
  });
  it('rejects invalid input', () => {
    expect(parseWeatherLocationInput('abc')).toEqual({ ok: false, error: 'Enter a valid 5/9-digit zip or lat,lng' });
  });
});
