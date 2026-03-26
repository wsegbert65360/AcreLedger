import { describe, it, expect } from 'vitest';
import { parseLocalDate, formatDisplayDate, formatIsoDate } from './dates';
import { cleanName } from './text';
import { roundTo, formatMeasurement } from './numbers';
import { cleanName } from './text';

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

    it('formatDisplayDate should format correctly', () => {
        const d = new Date(2024, 2, 1); // March 1st 2024
        expect(formatDisplayDate(d)).toMatch(/Mar 1, 2024|03\/01\/2024/);
    });

    it('formatDisplayDate should handle invalid dates', () => {
        const d = new Date('invalid');
        expect(formatDisplayDate(d)).toBe('');
    });

    it('formatDisplayDate should handle year end correctly', () => {
        const d = new Date(2023, 11, 31); // Dec 31st 2023
        expect(formatDisplayDate(d)).toMatch(/Dec 31, 2023|12\/31\/2023/);
    });
});

describe('text utility', () => {
    describe('cleanName', () => {
        it('should return empty string for empty input', () => {
            expect(cleanName('')).toBe('');
        });

        it('should not modify a normal string without UUIDs or dashes', () => {
            expect(cleanName('Field North')).toBe('Field North');
        });

        it('should remove a single UUID from the string', () => {
            expect(cleanName('Field North 123e4567-e89b-12d3-a456-426614174000')).toBe('Field North');
            expect(cleanName('123e4567-e89b-12d3-a456-426614174000')).toBe('');
        });

        it('should remove multiple UUIDs and collapse spaces', () => {
            expect(cleanName('Field 123e4567-e89b-12d3-a456-426614174000 North 123e4567-e89b-12d3-a456-426614174001')).toBe('Field North');
        });

        it('should handle adjacent UUIDs without spaces', () => {
            expect(cleanName('Field123e4567-e89b-12d3-a456-426614174000123e4567-e89b-12d3-a456-426614174001North')).toBe('Field North');
        });

        it('should remove trailing dashes and em-dashes', () => {
            expect(cleanName('Field North -')).toBe('Field North');
            expect(cleanName('Field North-')).toBe('Field North');
            expect(cleanName('Field North  -  ')).toBe('Field North');
            expect(cleanName('Field North —')).toBe('Field North');
            expect(cleanName('Field North—')).toBe('Field North');
            expect(cleanName('Field North  —  ')).toBe('Field North');
        });

        it('should remove leading dashes and em-dashes', () => {
            expect(cleanName('- Field North')).toBe('Field North');
            expect(cleanName('— Field North')).toBe('Field North');
            expect(cleanName('-Field North')).toBe('Field North');
        });

        it('should handle complex combinations of UUIDs and delimiters', () => {
            expect(cleanName('Field North - 123e4567-e89b-12d3-a456-426614174000')).toBe('Field North');
            expect(cleanName('123e4567-e89b-12d3-a456-426614174000 - Field North - ')).toBe('Field North');
            expect(cleanName(' - — 123e4567-e89b-12d3-a456-426614174000 - Field North — ')).toBe('Field North');
        });

        it('should handle lowercase and uppercase UUIDs', () => {
            expect(cleanName('Field North 123E4567-E89B-12D3-A456-426614174000')).toBe('Field North');
        });
    });
});

describe('numbers utility', () => {
    it('roundTo should round correctly', () => {
        expect(roundTo(1.2345, 2)).toBe(1.23);
        expect(roundTo(1.235, 2)).toBe(1.24);
        expect(roundTo(1.23, 0)).toBe(1);
        expect(roundTo(NaN, 2)).toBe(0);
    });

    describe('formatMeasurement', () => {
        it('should format simple measurements with default decimals', () => {
            expect(formatMeasurement(80.123, 'ac')).toBe('80.12 ac');
            expect(formatMeasurement(10, 'lbs')).toBe('10 lbs');
        });

        it('should format with custom decimals', () => {
            expect(formatMeasurement(1.2345, 'gal', 3)).toBe('1.235 gal');
            expect(formatMeasurement(1.2345, 'gal', 0)).toBe('1 gal');
            expect(formatMeasurement(1.9, 'gal', 0)).toBe('2 gal');
        });

        it('should format large numbers with commas', () => {
            expect(formatMeasurement(1234567.89, 'bu')).toBe('1,234,567.89 bu');
            expect(formatMeasurement(1200.5, 'bu', 1)).toBe('1,200.5 bu');
        });

        it('should handle invalid inputs gracefully', () => {
            expect(formatMeasurement(NaN, 'ac')).toBe('0 ac');
            expect(formatMeasurement(undefined as any, 'ac')).toBe('0 ac');
            expect(formatMeasurement(null as any, 'ac')).toBe('0 ac');
            expect(formatMeasurement('invalid' as any, 'ac')).toBe('0 ac');
        });
    });
});

describe('text utility', () => {
    describe('cleanName', () => {
        it('should return empty string for empty input', () => {
            expect(cleanName('')).toBe('');
        });

        it('should not modify a normal string without UUIDs or dashes', () => {
            expect(cleanName('Field North')).toBe('Field North');
        });

        it('should remove a single UUID from the string', () => {
            expect(cleanName('Field North 123e4567-e89b-12d3-a456-426614174000')).toBe('Field North');
            expect(cleanName('123e4567-e89b-12d3-a456-426614174000')).toBe('');
        });

        it('should remove multiple UUIDs from the string', () => {
            expect(cleanName('Field 123e4567-e89b-12d3-a456-426614174000 North 123e4567-e89b-12d3-a456-426614174001')).toBe('Field  North');
        });

        it('should remove trailing dashes', () => {
            expect(cleanName('Field North -')).toBe('Field North');
            expect(cleanName('Field North-')).toBe('Field North');
            expect(cleanName('Field North  -  ')).toBe('Field North');
        });

        it('should remove trailing em-dashes', () => {
            expect(cleanName('Field North —')).toBe('Field North');
            expect(cleanName('Field North—')).toBe('Field North');
            expect(cleanName('Field North  —  ')).toBe('Field North');
        });

        it('should handle combinations of UUIDs and dashes', () => {
            expect(cleanName('Field North - 123e4567-e89b-12d3-a456-426614174000')).toBe('Field North');
            expect(cleanName('123e4567-e89b-12d3-a456-426614174000 - Field North - ')).toBe('- Field North');
        });

        it('should handle lowercase and uppercase UUIDs', () => {
            expect(cleanName('Field North 123E4567-E89B-12D3-A456-426614174000')).toBe('Field North');
        });
    });
});
