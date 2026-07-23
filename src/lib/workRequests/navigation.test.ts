import { describe, it, expect } from 'vitest';
import { buildNavigationUrl, formatNavigationCoords } from './navigation';

describe('buildNavigationUrl', () => {
  it('produces a universal Google Maps URL for pdf context', () => {
    const url = buildNavigationUrl(38.5, -93.2, 'pdf');
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=38.5,-93.2');
  });

  it('defaults to the pdf context', () => {
    const url = buildNavigationUrl(40, -90);
    expect(url).toContain('https://www.google.com/maps/search/');
    expect(url).toContain('query=40,-90');
  });

  it('uses the maps:// scheme for the app context on iOS user agents', () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', configurable: true });
    try {
      const url = buildNavigationUrl(38.5, -93.2, 'app');
      expect(url).toBe('maps://?q=38.5,-93.2');
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
    }
  });
});

describe('formatNavigationCoords', () => {
  it('formats coordinates to 5 decimals', () => {
    expect(formatNavigationCoords(38.123456, -93.654321)).toBe('38.12346, -93.65432');
  });

  it('returns a placeholder when coordinates are missing', () => {
    expect(formatNavigationCoords(undefined, undefined)).toBe('Coordinates unavailable');
    expect(formatNavigationCoords(null, null)).toBe('Coordinates unavailable');
  });
});
