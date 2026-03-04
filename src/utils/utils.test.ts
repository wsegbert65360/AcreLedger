import { describe, it, expect } from 'vitest';
import { parseLocalDate, formatDisplayDate, formatIsoDate } from './dates';
import { roundTo, formatMeasurement } from './numbers';

describe('dates utility', () => {
    it('parseLocalDate should parse YYYY-MM-DD correctly without shift', () => {
        const d = parseLocalDate('2024-03-01');
        expect(d.getFullYear()).toBe(2024);
        expect(d.getMonth()).toBe(2); // March (0-indexed)
        expect(d.getDate()).toBe(1);
    });

    it('formatDisplayDate should format correctly', () => {
        const d = new Date(2024, 2, 1); // March 1st
        // Use a regex or check for inclusion to be robust against env locales
        expect(formatDisplayDate(d)).toMatch(/Mar 1, 2024|03\/01\/2024/);
    });

    it('formatIsoDate should handle various inputs', () => {
        expect(formatIsoDate('2024-03-01')).toMatch(/Mar 1, 2024|03\/01\/2024/);
        expect(formatIsoDate('2024-03-01T12:00:00Z')).toMatch(/Mar 1, 2024|03\/01\/2024/);
        expect(formatIsoDate('')).toBe('');
        expect(formatIsoDate(undefined)).toBe('');
        expect(formatIsoDate(null)).toBe('');
    });
});

describe('numbers utility', () => {
    it('roundTo should round correctly', () => {
        expect(roundTo(1.2345, 2)).toBe(1.23);
        expect(roundTo(1.235, 2)).toBe(1.24);
        expect(roundTo(1.23, 0)).toBe(1);
        expect(roundTo(NaN, 2)).toBe(0);
    });

    it('formatMeasurement should include unit', () => {
        expect(formatMeasurement(80.123, 'ac')).toBe('80.12 ac');
        // toLocaleString() might vary by env too, usually bu doesn't have 2 fixed decimals unless specified
        expect(formatMeasurement(1200.5, 'bu')).toContain('1,200.5');
    });
});
