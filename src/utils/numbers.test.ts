import { describe, expect, it } from 'vitest';

import { CAPACITY_LEVEL_STYLES, getCapacityLevel, getSignedBushels, roundTo, wholePercents } from './numbers';

describe('getSignedBushels', () => {
    it('preserves raw bushel sign while applying movement direction', () => {
        expect(getSignedBushels({ type: 'in', bushels: 100 })).toBe(100);
        expect(getSignedBushels({ type: 'out', bushels: 100 })).toBe(-100);
        expect(getSignedBushels({ type: 'in', bushels: -25 })).toBe(-25);
        expect(getSignedBushels({ type: 'out', bushels: -25 })).toBe(25);
    });
});

describe('getCapacityLevel', () => {
    it('bands fill against the 60 / 85 thresholds', () => {
        expect(getCapacityLevel(0)).toBe('ok');
        expect(getCapacityLevel(60)).toBe('ok');
        expect(getCapacityLevel(60.1)).toBe('warning');
        expect(getCapacityLevel(85)).toBe('warning');
        expect(getCapacityLevel(85.1)).toBe('critical');
    });

    it('treats non-finite values as empty rather than critical', () => {
        expect(getCapacityLevel(Number.NaN)).toBe('ok');
        expect(getCapacityLevel(Number.POSITIVE_INFINITY)).toBe('ok');
    });
});

describe('CAPACITY_LEVEL_STYLES', () => {
    it('keeps the ok band on plant tokens so color-mode card hues cannot fake a warning', () => {
        expect(CAPACITY_LEVEL_STYLES.ok.tone).toContain('text-plant');
        expect(CAPACITY_LEVEL_STYLES.ok.statusClassName).toContain('text-plant');
        expect(CAPACITY_LEVEL_STYLES.ok.tone).not.toContain('text-primary');
        expect(CAPACITY_LEVEL_STYLES.ok.statusClassName).not.toContain('primary');
    });
});

describe('roundTo', () => {
    it('rounds half up at the decimal the farmer sees', () => {
        expect(roundTo(1.005, 2)).toBe(1.01);
        expect(roundTo(2.675, 2)).toBe(2.68);
        expect(roundTo(1234.565, 2)).toBe(1234.57);
        expect(roundTo(-1.005, 2)).toBe(-1);
        expect(roundTo(1e-7, 2)).toBe(0);
        expect(roundTo(1.5e21, 2)).toBe(1.5e21);
        expect(roundTo(Number.NaN, 2)).toBe(0);
        expect(roundTo(Number.POSITIVE_INFINITY, 2)).toBe(0);
    });
});

describe('wholePercents', () => {
    it('always adds to 100', () => {
        expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
        expect(wholePercents([0.335, 0.335, 0.33])).toEqual([34, 33, 33]);
        expect(wholePercents([0.994, 0.006])).toEqual([99, 1]);
        expect(wholePercents([0.6, 0.4])).toEqual([60, 40]);
    });

    it('handles empty or zero weights', () => {
        expect(wholePercents([])).toEqual([]);
        expect(wholePercents([0, 0])).toEqual([0, 0]);
        expect(wholePercents([Number.NaN, 2])).toEqual([0, 100]);
    });
});
