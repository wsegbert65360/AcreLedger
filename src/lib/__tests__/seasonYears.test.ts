import { describe, expect, it } from 'vitest';

import {
  buildSeasonOptions,
  clampViewingSeason,
  getMaxViewingSeason,
  getSeasonPreset,
  isValidActiveSeason,
  isValidViewingSeason,
  resolveHarvestYear,
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

describe('region-aware season presets (AU pilot)', () => {
  it('leaves the US preset empty (calendar-year seasons, unchanged)', () => {
    expect(getSeasonPreset('US')).toEqual({});
  });

  it('defines AU winter-crop windows (Apr–Jun plant, Oct–Dec harvest)', () => {
    const preset = getSeasonPreset('AU');
    expect(preset.winterCrop).toEqual({
      plantStartMonth: 4,
      plantEndMonth: 6,
      harvestStartMonth: 10,
      harvestEndMonth: 12,
    });
  });

  it('defines AU summer-crop windows (Sep–Nov plant, Feb–Apr harvest)', () => {
    const preset = getSeasonPreset('AU');
    expect(preset.summerCrop).toEqual({
      plantStartMonth: 9,
      plantEndMonth: 11,
      harvestStartMonth: 2,
      harvestEndMonth: 4,
    });
  });

  it('keeps the harvest in the plant year when the window does not cross January', () => {
    const preset = getSeasonPreset('AU');
    expect(resolveHarvestYear(2026, preset.winterCrop!)).toBe(2026);
  });

  it('moves the harvest to the next year when the window crosses January', () => {
    const preset = getSeasonPreset('AU');
    expect(resolveHarvestYear(2026, preset.summerCrop!)).toBe(2027);
  });
});
