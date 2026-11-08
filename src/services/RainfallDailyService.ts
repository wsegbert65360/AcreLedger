import { supabase } from '@/lib/supabase';
import type { RainfallResult } from '@/services/RainService';

/**
 * Free-tier rainfall: one total per day (the 24 hours ending 8:00 am Central),
 * read from Supabase instead of the live Rain API. The server decides which
 * fields a free farm may read (get_field_rainfall_daily raises P0402 otherwise).
 */
export type DailyRainRow = { rain_date: string; rainfall_in: number };

const CHICAGO = 'America/Chicago';

/** Today's calendar date (YYYY-MM-DD) in America/Chicago. */
export function chicagoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sum of the days with rain_date >= start (inclusive). */
function sumFrom(rows: DailyRainRow[], start: string): number {
  return round3(rows.filter((r) => r.rain_date >= start).reduce((s, r) => s + r.rainfall_in, 0));
}

/**
 * Sum of the days strictly after an event date. A reading dated D covers the 24 hours
 * ending 8 am on D, i.e. mostly before a planting or spraying done during day D.
 */
function sumAfter(rows: DailyRainRow[], eventDate: string): number {
  return sumFrom(rows, shiftDate(eventDate, 1));
}

/**
 * Pure: build the same RainfallResult the live API returns, from daily rows.
 * 24h = the latest reading; 72h / 7d = the last 3 / 7 readings' dates.
 */
export function summarizeDailyRainfall(
  rows: DailyRainRow[],
  opts: { today: string; sincePlantingDate?: string; sinceLastSprayDate?: string; now?: Date },
): RainfallResult {
  const sorted = [...rows].sort((a, b) => a.rain_date.localeCompare(b.rain_date));
  const latest = sorted[sorted.length - 1]?.rain_date ?? null;
  const day = (isoLike?: string) => (isoLike ? isoLike.slice(0, 10) : null);
  const planting = day(opts.sincePlantingDate);
  const spray = day(opts.sinceLastSprayDate);
  const stale = !latest || latest < shiftDate(opts.today, -2);
  return {
    '24h': latest ? round3(sorted[sorted.length - 1].rainfall_in) : 0,
    '72h': latest ? sumFrom(sorted, shiftDate(latest, -2)) : 0,
    '168h': latest ? sumFrom(sorted, shiftDate(latest, -6)) : 0,
    '7d': latest ? sumFrom(sorted, shiftDate(latest, -6)) : 0,
    sincePlanting: opts.sincePlantingDate ? (planting ? sumAfter(sorted, planting) : null) : 0,
    sinceLastSpray: opts.sinceLastSprayDate ? (spray ? sumAfter(sorted, spray) : null) : 0,
    periodEndUtc: (opts.now ?? new Date()).toISOString(),
    dataWarning: stale ? 'Daily rainfall has not updated recently. Totals are from the last available reading.' : undefined,
  };
}

export const RainfallDailyService = {
  async fetchDailyRows(fieldId: string, start: string, end: string): Promise<DailyRainRow[]> {
    const { data, error } = await supabase.rpc('get_field_rainfall_daily', {
      p_field_id: fieldId, p_start: start, p_end: end,
    });
    if (error) throw error;
    return ((data ?? []) as Array<{ rain_date: string; rainfall_in: number | string }>).map((r) => ({
      rain_date: r.rain_date,
      rainfall_in: Number(r.rainfall_in),
    }));
  },

  /** Same shape as RainService.fetchComprehensiveRainfall, built from daily totals. */
  async fetchRainfallFromDaily(args: {
    fieldId: string;
    sincePlantingDate?: string;
    sinceLastSprayDate?: string;
  }): Promise<RainfallResult> {
    const today = chicagoToday();
    const earliest = [shiftDate(today, -8), args.sincePlantingDate?.slice(0, 10), args.sinceLastSprayDate?.slice(0, 10)]
      .filter((d): d is string => !!d)
      .sort()[0];
    // Cap the look-back at ~13 months so one call stays small.
    const start = earliest < shiftDate(today, -400) ? shiftDate(today, -400) : earliest;
    const rows = await this.fetchDailyRows(args.fieldId, start, today);
    return summarizeDailyRainfall(rows, { today, ...args });
  },
};
