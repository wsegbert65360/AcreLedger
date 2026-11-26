import type { CattleEvent, CountClass } from '@/types/cattle';
import { COUNT_CLASSES, COUNT_LABELS } from './counts';
import { parseHeadCount } from './ui';

/** Head typed per class on the Sell, Death, Transfer and Wean forms. */
export type ClassText = Record<CountClass, string>;

export interface ClassLine {
  cls: CountClass;
  head: number;
}

export function emptyClassText(): ClassText {
  return Object.fromEntries(COUNT_CLASSES.map(item => [item, ''])) as ClassText;
}

/**
 * The per-class head typed on a form, checked against what the herd holds. Blank rows
 * are skipped; at least one class must have head; no class can go below zero.
 */
export function parseClassLines(
  text: ClassText,
  counts: Record<CountClass, number>,
  herdName: string,
): { lines: ClassLine[]; error?: undefined } | { lines?: undefined; error: string } {
  const lines: ClassLine[] = [];
  for (const cls of COUNT_CLASSES) {
    const raw = text[cls].trim();
    if (raw === '') continue;
    const head = parseHeadCount(raw);
    if (head === null || head < 1) return { error: `${COUNT_LABELS[cls].many} must be a whole number, at least 1.` };
    if (head > counts[cls]) {
      return { error: `${herdName} only has ${counts[cls]} ${counts[cls] === 1 ? COUNT_LABELS[cls].one : COUNT_LABELS[cls].many}.` };
    }
    lines.push({ cls, head });
  }
  if (lines.length === 0) return { error: 'Enter how many head, for at least one class.' };
  return { lines };
}

export interface CalvesBySex { heifer: number; steer: number; bull: number; unknown: number }

/** Calves born in a herd in a year, by the sex recorded at calving. */
export function calvesBornBySex(
  events: Pick<CattleEvent, 'groupId' | 'eventType' | 'eventDate' | 'headDelta' | 'calfSex' | 'deleted_at'>[],
  groupId: string,
  year: string,
): CalvesBySex {
  const born: CalvesBySex = { heifer: 0, steer: 0, bull: 0, unknown: 0 };
  for (const event of events) {
    if (event.deleted_at || event.groupId !== groupId || event.eventType !== 'calving') continue;
    if (!event.eventDate.startsWith(year) || event.headDelta <= 0) continue;
    born[event.calfSex ?? 'unknown'] += event.headDelta;
  }
  return born;
}

/**
 * Suggested heifer / steer split for weaning `head` calves, from the sex recorded at
 * calving. Bull calves are assumed to become steers. Null when no sex was recorded.
 */
export function weaningSplitDefaults(
  born: CalvesBySex,
  head: number,
): { heifers: number; steers: number } | null {
  if (head < 1 || born.heifer + born.steer + born.bull === 0) return null;
  const heifers = Math.min(head, born.heifer);
  return { heifers, steers: head - heifers };
}
