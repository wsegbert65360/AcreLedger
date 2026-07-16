import { describe, expect, it } from 'vitest';

import {
  buildSeasonOptions,
  clampViewingSeason,
  getMaxViewingSeason,
  isValidActiveSeason,
  isValidViewingSeason,
  resolveRemoteViewingSeason,
} from '@/lib/seasonYears';

describe('season year rules', () => {
  it('offers the next season for pre-season entry', () => {
    expect(buildSeasonOptions(2026, [[]], 2026)).toEqual([2027, 2026, 2025, 2024]);
  });

  it('never offers a season beyond the absolute current-year limit', () => {
    expect(getMaxViewingSeason(2027, 2026)).toBe(2027);
    expect(buildSeasonOptions(2027, [[]], 2026)).toEqual([2027, 2026, 2025]);
    expect(isValidViewingSeason(2028, 2027, 2026)).toBe(false);
  });

  it('preserves valid historical viewing years and clamps stale ones', () => {
    expect(clampViewingSeason(2023, 2027, 2026)).toBe(2023);
    expect(clampViewingSeason(2016, 2027, 2026)).toBe(2027);
  });

  it('advances a device that was viewing the previous active season', () => {
    expect(resolveRemoteViewingSeason(2026, 2026, 2027, 2026)).toBe(2027);
    expect(resolveRemoteViewingSeason(2023, 2026, 2027, 2026)).toBe(2023);
  });

  it('rejects invalid active years', () => {
    expect(isValidActiveSeason(2027, 2026)).toBe(true);
    expect(isValidActiveSeason(2028, 2026)).toBe(false);
    expect(isValidActiveSeason(1999, 2026)).toBe(false);
    expect(isValidActiveSeason(2026.5, 2026)).toBe(false);
  });

  it('keeps record-derived options inside the viewing window', () => {
    const options = buildSeasonOptions(2026, [[
      { seasonYear: 2023 },
      { seasonYear: 2015 },
      { seasonYear: 2028 },
    ]], 2026);

    expect(options).toEqual([2027, 2026, 2025, 2024, 2023]);
  });
});
