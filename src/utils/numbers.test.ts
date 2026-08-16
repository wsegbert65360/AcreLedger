import { describe, expect, it } from 'vitest';

import { CAPACITY_LEVEL_STYLES, getCapacityLevel, getSignedBushels } from './numbers';

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
