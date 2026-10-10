import { describe, expect, it } from 'vitest';

import {
  completedHours,
  floorToHour,
  mergeRetryHours,
  MAX_RETRY_HOURS,
  OVERNIGHT_WINDOW_HOURS,
} from '../../supabase/functions/shared/mrmsSchedule';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-30T18:37:12.000Z');

describe('floorToHour', () => {
  it('floors to the top of the UTC hour', () => {
    expect(floorToHour(NOW).toISOString()).toBe('2026-09-30T18:00:00.000Z');
  });
});

describe('completedHours', () => {
  it('returns the previous whole hours, newest first, excluding the current hour', () => {
    const hours = completedHours(NOW, 3).map((hour) => hour.toISOString());
    expect(hours).toEqual([
      '2026-09-30T17:00:00.000Z',
      '2026-09-30T16:00:00.000Z',
      '2026-09-30T15:00:00.000Z',
    ]);
  });

  it('defaults the nightly window to ten hours', () => {
    expect(OVERNIGHT_WINDOW_HOURS).toBe(10);
    expect(completedHours(NOW, OVERNIGHT_WINDOW_HOURS)).toHaveLength(10);
  });
});

describe('mergeRetryHours', () => {
  const recent = completedHours(NOW, 2); // 17:00, 16:00

  it('appends aged-out failures newest first', () => {
    const merged = mergeRetryHours(
      recent,
      [new Date('2026-09-30T09:00:00.000Z'), new Date('2026-09-30T12:00:00.000Z')],
      NOW,
    ).map((hour) => hour.toISOString());
    expect(merged).toEqual([
      '2026-09-30T17:00:00.000Z',
      '2026-09-30T16:00:00.000Z',
      '2026-09-30T12:00:00.000Z',
      '2026-09-30T09:00:00.000Z',
    ]);
  });

  it('de-duplicates hours already inside the recent window', () => {
    const merged = mergeRetryHours(recent, [new Date('2026-09-30T16:00:00.000Z')], NOW);
    expect(merged.map((hour) => hour.toISOString())).toEqual([
      '2026-09-30T17:00:00.000Z',
      '2026-09-30T16:00:00.000Z',
    ]);
  });

  it('ignores the current and future hours', () => {
    const merged = mergeRetryHours(recent, [NOW, new Date('2026-10-01T00:00:00.000Z')], NOW);
    expect(merged).toHaveLength(2);
  });

  it('floors non-hour-aligned failures so retries collapse onto one hour', () => {
    const merged = mergeRetryHours(
      recent,
      [new Date('2026-09-30T09:42:11.000Z'), new Date('2026-09-30T09:05:00.000Z')],
      NOW,
    );
    expect(merged).toHaveLength(3);
    expect(merged[2].toISOString()).toBe('2026-09-30T09:00:00.000Z');
  });

  it('caps retries so one run cannot fan out without bound', () => {
    const many = Array.from(
      { length: MAX_RETRY_HOURS + 5 },
      (_, index) => new Date(new Date('2026-09-29T00:00:00.000Z').getTime() - index * HOUR),
    );
    const merged = mergeRetryHours(recent, many, NOW);
    expect(merged).toHaveLength(recent.length + MAX_RETRY_HOURS);
  });
});
