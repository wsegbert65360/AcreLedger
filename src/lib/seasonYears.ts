import type { CountryCode } from '@/store/useAppPreferences';

export const MIN_SEASON_YEAR = 2000;

export function getMaxActiveSeason(currentYear = new Date().getFullYear()): number {
  return currentYear + 1;
}

export function getMaxViewingSeason(
  activeSeason: number,
  currentYear = new Date().getFullYear(),
): number {
  return Math.min(activeSeason + 1, getMaxActiveSeason(currentYear));
}

export function isValidActiveSeason(
  year: number,
  currentYear = new Date().getFullYear(),
): boolean {
  return Number.isInteger(year)
    && year >= MIN_SEASON_YEAR
    && year <= getMaxActiveSeason(currentYear);
}

export function isValidViewingSeason(
  year: number,
  activeSeason: number,
  currentYear = new Date().getFullYear(),
): boolean {
  return Number.isInteger(year)
    && year >= activeSeason - 10
    && year <= getMaxViewingSeason(activeSeason, currentYear);
}

export function clampViewingSeason(
  year: number,
  activeSeason: number,
  currentYear = new Date().getFullYear(),
): number {
  return isValidViewingSeason(year, activeSeason, currentYear) ? year : activeSeason;
}

export function resolveRemoteViewingSeason(
  currentViewingSeason: number,
  previousActiveSeason: number,
  nextActiveSeason: number,
  currentYear = new Date().getFullYear(),
): number {
  if (currentViewingSeason === previousActiveSeason) return nextActiveSeason;
  return clampViewingSeason(currentViewingSeason, nextActiveSeason, currentYear);
}

type SeasonRecord = { seasonYear?: number | null };

export function buildSeasonOptions(
  activeSeason: number,
  collections: readonly (readonly SeasonRecord[])[],
  currentYear = new Date().getFullYear(),
): number[] {
  const seasons = new Set<number>([
    getMaxViewingSeason(activeSeason, currentYear),
    activeSeason,
    activeSeason - 1,
    activeSeason - 2,
  ]);

  collections.forEach(records => {
    records.forEach(record => {
      if (record.seasonYear != null) seasons.add(record.seasonYear);
    });
  });

  return Array.from(seasons)
    .filter(year => isValidViewingSeason(year, activeSeason, currentYear))
    .sort((a, b) => b - a);
}

/**
 * Region-aware season presets (Australia pilot, Phase 1e).
 *
 * US seasons remain calendar-year based with no month windows — the preset
 * is empty, preserving current behavior exactly. AU cropping follows
 * Southern Hemisphere windows:
 *   winter crop (wheat/barley/canola): planted Apr–Jun, harvested Oct–Dec
 *   summer crop (sorghum/cotton):      planted Sep–Nov, harvested Feb–Apr
 * The summer-crop harvest falls in the calendar year AFTER planting, which
 * resolveHarvestYear() handles explicitly.
 */

/** Planting/harvest window as calendar months (1–12). */
export interface SeasonWindow {
  plantStartMonth: number;
  plantEndMonth: number;
  harvestStartMonth: number;
  harvestEndMonth: number;
}

export interface SeasonPreset {
  winterCrop?: SeasonWindow;
  summerCrop?: SeasonWindow;
}

const AU_WINTER_CROP: SeasonWindow = {
  plantStartMonth: 4,
  plantEndMonth: 6,
  harvestStartMonth: 10,
  harvestEndMonth: 12,
};

const AU_SUMMER_CROP: SeasonWindow = {
  plantStartMonth: 9,
  plantEndMonth: 11,
  harvestStartMonth: 2,
  harvestEndMonth: 4,
};

const SEASON_PRESETS: Record<CountryCode, SeasonPreset> = {
  US: {},
  AU: { winterCrop: AU_WINTER_CROP, summerCrop: AU_SUMMER_CROP },
};

/** Season preset for a country. US returns no windows (current behavior). */
export function getSeasonPreset(country: CountryCode): SeasonPreset {
  return SEASON_PRESETS[country] ?? {};
}

/**
 * The calendar year in which a crop planted in `plantYear` is harvested.
 * A window whose harvest months precede its plant months (AU summer crop)
 * spans the year boundary, so harvest falls in plantYear + 1.
 */
export function resolveHarvestYear(plantYear: number, window: SeasonWindow): number {
  return window.harvestStartMonth < window.plantStartMonth ? plantYear + 1 : plantYear;
}
