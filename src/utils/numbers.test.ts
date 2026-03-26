import { describe, it, expect } from 'vitest';
import { roundTo, formatMeasurement } from './numbers';

describe('numbers utility - roundTo', () => {
    it('should round numbers to 2 decimal places by default', () => {
        expect(roundTo(1.2345)).toBe(1.23);
        expect(roundTo(1.235)).toBe(1.24);
        expect(roundTo(1.2)).toBe(1.2);
        expect(roundTo(1)).toBe(1);
    });

    it('should round numbers to specified decimal places', () => {
        expect(roundTo(1.2345, 3)).toBe(1.235);
        expect(roundTo(1.2345, 1)).toBe(1.2);
        expect(roundTo(1.5, 0)).toBe(2);
        expect(roundTo(1.49, 0)).toBe(1);
    });

    it('should handle negative numbers correctly', () => {
        expect(roundTo(-1.2345, 2)).toBe(-1.23);
        expect(roundTo(-1.235, 2)).toBe(-1.24);
        expect(roundTo(-1.236, 2)).toBe(-1.24);
        expect(roundTo(-1.5, 0)).toBe(-1); // Math.round(-1.5) is -1
        expect(roundTo(-1.6, 0)).toBe(-2);
    });

    it('should return 0 for non-numeric or NaN inputs', () => {
        expect(roundTo(NaN)).toBe(0);
        // @ts-ignore - testing invalid runtime input
        expect(roundTo(null)).toBe(0);
        // @ts-ignore - testing invalid runtime input
        expect(roundTo(undefined)).toBe(0);
        // @ts-ignore - testing invalid runtime input
        expect(roundTo('1.23')).toBe(0);
        // @ts-ignore - testing invalid runtime input
        expect(roundTo({})).toBe(0);
        // @ts-ignore - testing invalid runtime input
        expect(roundTo([])).toBe(0);
    });

    it('should handle 0 correctly', () => {
        expect(roundTo(0)).toBe(0);
        expect(roundTo(0, 2)).toBe(0);
    });
});

describe('numbers utility - formatMeasurement', () => {
    it('should format measurement with default 2 decimals', () => {
        expect(formatMeasurement(80.123, 'ac')).toBe('80.12 ac');
        expect(formatMeasurement(80.126, 'ac')).toBe('80.13 ac');
        expect(formatMeasurement(80, 'ac')).toBe('80 ac');
    });

    it('should format measurement with specified decimals', () => {
        expect(formatMeasurement(80.123, 'ac', 1)).toBe('80.1 ac');
        expect(formatMeasurement(80.123, 'ac', 0)).toBe('80 ac');
        expect(formatMeasurement(80.1234, 'ac', 3)).toBe('80.123 ac');
    });

    it('should format large numbers with localized thousand separators', () => {
        expect(formatMeasurement(1234.56, 'bu')).toBe('1,234.56 bu');
        expect(formatMeasurement(1234567.89, 'kg')).toBe('1,234,567.89 kg');
    });

    it('should handle NaN and invalid inputs gracefully (returns "0 unit")', () => {
        expect(formatMeasurement(NaN, 'ac')).toBe('0 ac');
        // @ts-ignore
        expect(formatMeasurement(null, 'ac')).toBe('0 ac');
    });
});
