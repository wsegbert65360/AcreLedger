/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sun, CloudRain, CloudSun, Cloud } from 'lucide-react';

import {
  ZIP_REGEX,
  loadZip,
  saveZip,
  formatTime,
  fallbackToFields,
  resolveCoords,
  getWeatherLucideIcon,
  getConditionGradient,
} from '../weatherHelpers';

vi.mock('@/lib/native', () => ({
  native: {
    geolocation: {
      getCurrentPosition: vi.fn(),
    },
  },
}));

import { native } from '@/lib/native';

describe('weatherHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
});
