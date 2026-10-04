import { describe, expect, it } from 'vitest';

import { formatNumber, parseLocalizedNumber } from './numbers';

describe('formatNumber', () => {
  it('groups thousands identically for en-US and en-AU', () => {
    expect(formatNumber(1234.5, 'en-US')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'en-AU')).toBe('1,234.5');
  });

  it('honors an explicit decimal count', () => {
    expect(formatNumber(1234.5, 'en-AU', { decimals: 2 })).toBe('1,234.50');
    expect(formatNumber(7, 'en-US', { decimals: 0 })).toBe('7');
  });

  it('renders nothing for non-finite values instead of NaN/Infinity text', () => {
    expect(formatNumber(Number.NaN, 'en-US')).toBe('');
    expect(formatNumber(Number.POSITIVE_INFINITY, 'en-AU')).toBe('');
  });
});

describe('parseLocalizedNumber', () => {
  it('parses plain decimals with a point separator', () => {
    expect(parseLocalizedNumber('12.5', 'en-US')).toBe(12.5);
    expect(parseLocalizedNumber('12.5', 'en-AU')).toBe(12.5);
  });

  it('strips grouping commas', () => {
    expect(parseLocalizedNumber('1,234.5', 'en-AU')).toBe(1234.5);
  });

  it('accepts signs and trims whitespace', () => {
    expect(parseLocalizedNumber(' -4.2 ', 'en-US')).toBe(-4.2);
    expect(parseLocalizedNumber('+0.75', 'en-AU')).toBe(0.75);
  });

  it('rejects non-numeric input instead of returning NaN', () => {
    expect(parseLocalizedNumber('', 'en-US')).toBeNull();
    expect(parseLocalizedNumber('abc', 'en-AU')).toBeNull();
    expect(parseLocalizedNumber('12.5%', 'en-US')).toBeNull();
    expect(parseLocalizedNumber('1,2,3.4.5', 'en-AU')).toBeNull();
  });
});
