import { describe, expect, it } from 'vitest';

import { parseLocalDate, toLocalIsoDate } from '../dates';

describe('toLocalIsoDate', () => {
    it('renders the local calendar date for a late-evening timestamp', () => {
        // Built from local components so the assertion holds in any timezone:
        // May 1, 11:30 PM local must render as May 1, not the UTC-shifted day.
        const evening = new Date(2026, 4, 1, 23, 30).getTime();
        expect(toLocalIsoDate(evening)).toBe('2026-05-01');
    });

    it('pads single-digit months and days', () => {
        expect(toLocalIsoDate(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
    });

    it('round-trips through parseLocalDate without a day shift', () => {
        const ts = new Date(2026, 6, 4, 20, 0).getTime();
        expect(parseLocalDate(toLocalIsoDate(ts)).getDate()).toBe(4);
    });
});
