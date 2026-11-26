import { afterEach, describe, expect, it } from 'vitest';

import { compareWorkDateDesc, getWorkDateMs, parseLocalDate, toLocalIsoDate, type WorkDateFields } from '../dates';

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

describe('getWorkDateMs', () => {
    it('prefers the work date over a later save timestamp', () => {
        const planted = getWorkDateMs({
            plantDate: '2026-04-22',
            timestamp: new Date(2026, 5, 19).getTime(),
        });
        const tilled = getWorkDateMs({
            date: '2026-05-02',
            timestamp: new Date(2026, 4, 2).getTime(),
        });
        expect(planted).toBeLessThan(tilled);
    });

    it('falls back to timestamp when no work date is stored', () => {
        const ts = new Date(2026, 7, 8, 14, 0).getTime();
        expect(getWorkDateMs({ timestamp: ts })).toBe(ts);
    });
});

describe('compareWorkDateDesc', () => {
    it('orders field history by the date on the row, newest first', () => {
        const plant: WorkDateFields = { plantDate: '2026-04-22', timestamp: 9_000 };
        const tillage: WorkDateFields = { date: '2026-05-02', timestamp: 1_000 };
        const spray: WorkDateFields = { sprayDate: '2026-06-19', timestamp: 2_000 };

        const ordered = [plant, tillage, spray].sort(compareWorkDateDesc);
        expect(ordered.map((row) => row.sprayDate || row.date || row.plantDate)).toEqual([
            '2026-06-19',
            '2026-05-02',
            '2026-04-22',
        ]);
    });
});

describe('toLocalIsoDate across time zones', () => {
  const original = process.env.TZ;
  afterEach(() => { process.env.TZ = original; });

  it('keeps the Missouri evening date, where a UTC slice gives tomorrow', () => {
    process.env.TZ = 'America/Chicago';
    const evening = Date.parse('2026-11-21T01:30:00Z'); // Nov 20, 7:30 pm CST
    expect(toLocalIsoDate(evening)).toBe('2026-11-20');
    expect(new Date(evening).toISOString().slice(0, 10)).toBe('2026-11-21');
  });

  it('keeps the Sydney morning date, where a UTC slice gives yesterday', () => {
    process.env.TZ = 'Australia/Sydney';
    const morning = Date.parse('2026-11-20T22:00:00Z'); // Nov 21, 9:00 am AEDT
    expect(toLocalIsoDate(morning)).toBe('2026-11-21');
  });
});

describe('parseLocalDate validation', () => {
  it('parses a real calendar day at local midnight', () => {
    const d = parseLocalDate('2028-02-29');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2028, 1, 29, 0]);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-2-3', 'not a date', '', '2026-11-22T10:00:00Z'])(
    'returns an invalid Date for %j instead of rolling over',
    (input) => {
      expect(Number.isNaN(parseLocalDate(input).getTime())).toBe(true);
    },
  );
});

