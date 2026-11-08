import { describe, expect, it } from 'vitest';
import {
  chicagoDate,
  dailyFileUrls,
  dailyReadingInstant,
  priorRainDates,
  targetRainDate,
} from '../../supabase/functions/shared/mrmsDaily';

describe('mrms daily helpers', () => {
  it('maps 08:00 Chicago to 13:00Z in CDT and 14:00Z in CST', () => {
    expect(dailyReadingInstant('2026-07-15').toISOString()).toBe('2026-07-15T13:00:00.000Z');
    expect(dailyReadingInstant('2026-12-15').toISOString()).toBe('2026-12-15T14:00:00.000Z');
  });

  it('handles the DST change days', () => {
    // Spring forward 2026-03-08 (reading at 08:00 CDT), fall back 2026-11-01 (08:00 CST).
    expect(dailyReadingInstant('2026-03-08').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(dailyReadingInstant('2026-11-01').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('chooses today only once the reading is published', () => {
    expect(targetRainDate(new Date('2026-07-15T14:00:00Z'))).toBe('2026-07-14'); // 09:00 local, too early
    expect(targetRainDate(new Date('2026-07-15T15:00:00Z'))).toBe('2026-07-15'); // 10:00 local
    expect(targetRainDate(new Date('2026-07-15T03:00:00Z'))).toBe('2026-07-14'); // 22:00 local previous day
  });

  it('formats Chicago dates across UTC midnight', () => {
    expect(chicagoDate(new Date('2026-07-16T03:00:00Z'))).toBe('2026-07-15');
  });

  it('lists prior dates newest first', () => {
    expect(priorRainDates('2026-03-02', 3)).toEqual(['2026-03-01', '2026-02-28', '2026-02-27']);
  });

  it('builds the Pass 2 and Pass 1 urls', () => {
    const u = dailyFileUrls('https://mrms.ncep.noaa.gov/2D/', '2026-07-15');
    expect(u.pass2).toBe(
      'https://mrms.ncep.noaa.gov/2D/MultiSensor_QPE_24H_Pass2/MRMS_MultiSensor_QPE_24H_Pass2_00.00_20260715-130000.grib2.gz',
    );
    expect(u.pass1).toContain('MultiSensor_QPE_24H_Pass1/MRMS_MultiSensor_QPE_24H_Pass1_00.00_20260715-130000');
  });
});
