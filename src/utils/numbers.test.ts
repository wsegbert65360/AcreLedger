import { describe, expect, it } from 'vitest';

import { getSignedBushels } from './numbers';

describe('getSignedBushels', () => {
    it('preserves raw bushel sign while applying movement direction', () => {
        expect(getSignedBushels({ type: 'in', bushels: 100 })).toBe(100);
        expect(getSignedBushels({ type: 'out', bushels: 100 })).toBe(-100);
        expect(getSignedBushels({ type: 'in', bushels: -25 })).toBe(-25);
        expect(getSignedBushels({ type: 'out', bushels: -25 })).toBe(25);
    });
});