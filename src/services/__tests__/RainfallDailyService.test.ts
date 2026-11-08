import { describe, expect, it } from 'vitest';
import { summarizeDailyRainfall } from '../RainfallDailyService';

const rows = [
  { rain_date: '2026-07-10', rainfall_in: 0.5 },
  { rain_date: '2026-07-12', rainfall_in: 0.25 },
  { rain_date: '2026-07-14', rainfall_in: 0.1 },
  { rain_date: '2026-07-15', rainfall_in: 0.3 },
];

describe('summarizeDailyRainfall', () => {
  it('uses the latest reading for 24h and date windows for 72h / 7d', () => {
    const r = summarizeDailyRainfall(rows, { today: '2026-07-15' });
    expect(r['24h']).toBe(0.3);
    expect(r['72h']).toBe(0.4); // 07-13..07-15
    expect(r['168h']).toBe(1.15); // 07-09..07-15
    expect(r['7d']).toBe(r['168h']);
    expect(r.dataWarning).toBeUndefined();
    expect(r.sincePlanting).toBe(0);
    expect(r.sinceLastSpray).toBe(0);
  });

  it('sums only readings after the planting and spray dates', () => {
    const r = summarizeDailyRainfall(rows, {
      today: '2026-07-15', sincePlantingDate: '2026-07-12T09:00:00Z', sinceLastSprayDate: '2026-07-14',
    });
    expect(r.sincePlanting).toBe(0.4); // 07-14 + 07-15 (the 07-12 reading is the day before)
    expect(r.sinceLastSpray).toBe(0.3); // 07-15 only
  });

  it('warns when the newest reading is stale and handles no data', () => {
    expect(summarizeDailyRainfall(rows, { today: '2026-07-20' }).dataWarning).toMatch(/not updated/);
    const empty = summarizeDailyRainfall([], { today: '2026-07-15' });
    expect(empty['24h']).toBe(0);
    expect(empty.dataWarning).toBeDefined();
  });
});
