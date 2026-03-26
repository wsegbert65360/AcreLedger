import { describe, it, expect } from 'vitest';
import { parseLocalDate, formatDisplayDate, formatIsoDate } from './dates';
import { cleanName } from './text';
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
    it('cleanName should remove UUIDs and trailing symbols', () => {
        expect(cleanName('Field Name - 550e8400-e29b-41d4-a716-446655440000')).toBe('Field Name');
        expect(cleanName('Field Name — 550e8400-e29b-41d4-a716-446655440000')).toBe('Field Name');
        expect(cleanName('Field-Name 550e8400-e29b-41d4-a716-446655440000')).toBe('Field-Name');
    });

    it('cleanName should handle multiple UUIDs', () => {
        const twoUuids = '550e8400-e29b-41d4-a716-446655440000-667f8511-f30c-52e5-b827-557766551111';
        expect(cleanName(twoUuids)).toBe('');
        
        expect(cleanName('Start 550e8400-e29b-41d4-a716-446655440000 Mid 667f8511-f30c-52e5-b827-557766551111 End'))
            .toBe('Start  Mid  End');
    });

    it('cleanName should trim whitespace and trailing dashes', () => {
        expect(cleanName('  Field Name  ')).toBe('Field Name');
        expect(cleanName('Field Name -')).toBe('Field Name');
        expect(cleanName('Field Name — ')).toBe('Field Name');
        expect(cleanName('Field Name - ')).toBe('Field Name');
    });

    it('cleanName should handle empty strings', () => {
        expect(cleanName('')).toBe('');
    });

    it('cleanName should not remove non-UUID dashes', () => {
        expect(cleanName('Field-Name-123')).toBe('Field-Name-123');
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
