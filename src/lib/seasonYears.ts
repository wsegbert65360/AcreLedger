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
