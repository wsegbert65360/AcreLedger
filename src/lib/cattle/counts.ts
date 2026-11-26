import type {
  CattleClass, CattleCounts, CattleEvent, CattleEventType, CattleGroup, CountClass,
} from '@/types/cattle';

/** Display order, breeding herd first. Mirrors the cattle_groups count columns. */
export const COUNT_CLASSES: readonly CountClass[] = ['cows', 'heifers', 'bulls', 'calves', 'steers', 'stockers'];

export const COUNT_LABELS: Record<CountClass, { one: string; many: string }> = {
  cows: { one: 'cow', many: 'cows' },
  heifers: { one: 'heifer', many: 'heifers' },
  bulls: { one: 'bull', many: 'bulls' },
  calves: { one: 'calf', many: 'calves' },
  steers: { one: 'steer', many: 'steers' },
  stockers: { one: 'stocker', many: 'stockers' },
};

export const COUNT_TITLES: Record<CountClass, string> = {
  cows: 'Cows', heifers: 'Heifers', bulls: 'Bulls', calves: 'Calves', steers: 'Steers', stockers: 'Stockers',
};

export function emptyCounts(): CattleCounts {
  return { cows: 0, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 };
}

export function countsTotal(counts: CattleCounts): number {
  return COUNT_CLASSES.reduce((sum, item) => sum + counts[item], 0);
}

export function sameCounts(a: CattleCounts, b: CattleCounts): boolean {
  return COUNT_CLASSES.every(item => a[item] === b[item]);
}

/** a + b per class; with floor, no class goes below zero. */
export function addCounts(a: CattleCounts, b: CattleCounts, floor = false): CattleCounts {
  const out = emptyCounts();
  for (const item of COUNT_CLASSES) out[item] = floor ? Math.max(0, a[item] + b[item]) : a[item] + b[item];
  return out;
}

/** a - b per class. */
export function diffCounts(a: CattleCounts, b: CattleCounts): CattleCounts {
  const out = emptyCounts();
  for (const item of COUNT_CLASSES) out[item] = a[item] - b[item];
  return out;
}

export function isCountClass(value: unknown): value is CountClass {
  return typeof value === 'string' && (COUNT_CLASSES as readonly string[]).includes(value);
}

/** The class a herd type's own head lands on (mirrors public._cattle_count_column). */
export function herdTypeClass(herdType: CattleClass): CountClass {
  switch (herdType) {
    case 'replacement_heifers': return 'heifers';
    case 'bulls': return 'bulls';
    case 'calves': return 'calves';
    case 'stockers': return 'stockers';
    default: return 'cows';
  }
}

/**
 * Counts from a database row. A row or cache from before mixed herds has no
 * count columns: its whole head count belongs to the herd type's class.
 */
export function countsFromRow(row: Partial<Record<CountClass, unknown>>, herdType: CattleClass, headCount: number): CattleCounts {
  const hasCounts = COUNT_CLASSES.some(item => typeof row[item] === 'number');
  const counts = emptyCounts();
  if (!hasCounts) {
    counts[herdTypeClass(herdType)] = Math.max(0, headCount);
    return counts;
  }
  for (const item of COUNT_CLASSES) {
    const value = Number(row[item]);
    counts[item] = Number.isInteger(value) && value > 0 ? value : 0;
  }
  return counts;
}

/** A group's counts, also for a group cached on the device before mixed herds. */
export function groupCounts(group: Pick<CattleGroup, 'class' | 'headCount'> & { counts?: CattleCounts }): CattleCounts {
  return group.counts ? { ...emptyCounts(), ...group.counts } : countsFromRow({}, group.class, group.headCount);
}

/** Fills counts on a cached or restored group that predates mixed herds. */
export function normalizeCattleGroup<T extends Pick<CattleGroup, 'class' | 'headCount'> & { counts?: CattleCounts }>(
  group: T,
): T & { counts: CattleCounts } {
  const counts = groupCounts(group);
  return { ...group, counts, headCount: countsTotal(counts) };
}

/** Which class a head change hits; matches log_cattle_event. Undefined when no head changes. */
export function resolveEventClass(
  eventType: CattleEventType,
  headDelta: number,
  cattleClass: CountClass | undefined,
  herdType: CattleClass,
): CountClass | undefined {
  if (eventType === 'calving') return 'calves';
  if (eventType === 'reclass') return cattleClass;
  if (headDelta === 0) return undefined;
  return cattleClass ?? herdTypeClass(herdType);
}

/** Adds a delta to one class, floored at zero, and keeps the total in step. */
export function withClassDelta<T extends Pick<CattleGroup, 'counts' | 'headCount'>>(group: T, cls: CountClass, delta: number): T {
  const counts = { ...group.counts, [cls]: Math.max(0, group.counts[cls] + delta) };
  return { ...group, counts, headCount: countsTotal(counts) };
}

/** Applies (direction 1) or reverses (direction -1) an event's change on a group. */
export function applyEventToGroup<T extends Pick<CattleGroup, 'counts' | 'headCount' | 'class'>>(
  group: T,
  event: Pick<CattleEvent, 'eventType' | 'headDelta' | 'cattleClass' | 'toClass' | 'classHead'>,
  direction: 1 | -1,
): T {
  if (event.eventType === 'reclass') {
    if (!event.cattleClass || !event.toClass || !event.classHead) return group;
    const from = direction === 1 ? event.cattleClass : event.toClass;
    const to = direction === 1 ? event.toClass : event.cattleClass;
    const moved = Math.min(group.counts[from], event.classHead);
    const counts = { ...group.counts, [from]: group.counts[from] - moved, [to]: group.counts[to] + moved };
    return { ...group, counts, headCount: countsTotal(counts) };
  }
  const cls = resolveEventClass(event.eventType, event.headDelta, event.cattleClass, group.class);
  return cls ? withClassDelta(group, cls, direction * event.headDelta) : group;
}

/** Reads a counts object an RPC returned, or null. */
export function countsFromRpc(value: unknown): CattleCounts | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const counts = emptyCounts();
  for (const item of COUNT_CLASSES) {
    const number = Number(source[item]);
    if (!Number.isInteger(number) || number < 0) return null;
    counts[item] = number;
  }
  return counts;
}

/** "30 cows · 28 calves · 1 bull"; classes at zero are left out. */
export function countsSummary(counts: CattleCounts): string {
  const parts = COUNT_CLASSES.filter(item => counts[item] > 0)
    .map(item => `${counts[item]} ${counts[item] === 1 ? COUNT_LABELS[item].one : COUNT_LABELS[item].many}`);
  return parts.length > 0 ? parts.join(' · ') : 'No head';
}

/** Cow-calf pairs: a calf with a cow or a first-calf heifer. */
export function pairCount(counts: CattleCounts): number {
  return Math.min(counts.cows + counts.heifers, counts.calves);
}

/** Females per bull, rounded, or null without both. */
export function femalesPerBull(counts: CattleCounts): number | null {
  const females = counts.cows + counts.heifers;
  return counts.bulls > 0 && females > 0 ? Math.round(females / counts.bulls) : null;
}

export interface CalvingStats {
  year: string;
  calvesBorn: number;
  calvesLost: number;
  /** Calves born per cow and heifer now in the herd, as a whole percent; null with no females. */
  calvingPercent: number | null;
}

/** Calving totals for one calendar year of a herd's live events. */
export function calvingStats(
  group: Pick<CattleGroup, 'id' | 'counts'>,
  events: Pick<CattleEvent, 'groupId' | 'eventType' | 'eventDate' | 'headDelta' | 'cattleClass' | 'deleted_at' | 'transferId'>[],
  year: string,
): CalvingStats {
  let calvesBorn = 0;
  let calvesLost = 0;
  for (const event of events) {
    if (event.deleted_at || event.groupId !== group.id || !event.eventDate.startsWith(year)) continue;
    if (event.eventType === 'calving') calvesBorn += event.headDelta;
    if (event.eventType === 'death' && event.cattleClass === 'calves') calvesLost -= event.headDelta;
  }
  const females = group.counts.cows + group.counts.heifers;
  return {
    year,
    calvesBorn,
    calvesLost,
    calvingPercent: females > 0 && calvesBorn > 0 ? Math.round((calvesBorn / females) * 100) : null,
  };
}
