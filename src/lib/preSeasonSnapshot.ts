/** Device pointer to the server pre-season snapshot. Scoped by user and farm. */

export type PreSeasonSnapshotRef = {
  id: string;
  fromSeason: number;
  toSeason: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function preSeasonSnapshotKey(userId: string, farmId: string): string {
  return `${userId}_${farmId}_al_pre_season_snapshot`;
}

export function isPreSeasonSnapshotId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isSeasonYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function readPreSeasonSnapshot(
  userId: string | null | undefined,
  farmId: string | null | undefined,
): PreSeasonSnapshotRef | null {
  if (!userId || !farmId) return null;
  try {
    const raw = localStorage.getItem(preSeasonSnapshotKey(userId, farmId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PreSeasonSnapshotRef>;
    if (!isPreSeasonSnapshotId(parsed.id)) return null;
    if (!isSeasonYear(parsed.fromSeason) || !isSeasonYear(parsed.toSeason)) return null;
    if (parsed.toSeason !== parsed.fromSeason + 1) return null;
    return { id: parsed.id, fromSeason: parsed.fromSeason, toSeason: parsed.toSeason };
  } catch {
    return null;
  }
}

export function writePreSeasonSnapshot(
  userId: string,
  farmId: string,
  snapshot: PreSeasonSnapshotRef,
): void {
  localStorage.setItem(preSeasonSnapshotKey(userId, farmId), JSON.stringify(snapshot));
}

export function clearPreSeasonSnapshot(
  userId: string | null | undefined,
  farmId: string | null | undefined,
): void {
  if (!userId || !farmId) return;
  try {
    localStorage.removeItem(preSeasonSnapshotKey(userId, farmId));
  } catch {
    /* ignore */
  }
}

/** The snapshot id on this device can never undo that reset. Drop the pointer. */
export function isTerminalPreSeasonUndoError(message: string): boolean {
  return /already undone|older than 30 days|snapshot not found|only the latest pre-season reset/i.test(message);
}
