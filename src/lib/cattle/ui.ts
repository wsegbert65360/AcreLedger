import type {
  CalfSex, CattleClass, CattleEvent, CattleEventType, CattleGroup, CattleRemovalReason,
} from '@/types/cattle';
import { COUNT_LABELS } from './counts';

/** Herd types. Cow-calf (stored as 'mixed') comes first: cows, calves and bulls together. */
export const CATTLE_CLASS_LABELS: Record<CattleClass, string> = {
  mixed: 'Cow-calf herd',
  cows: 'Cows',
  replacement_heifers: 'Heifers',
  bulls: 'Bulls',
  calves: 'Calves',
  stockers: 'Stockers / steers',
};
export const CATTLE_CLASSES = Object.keys(CATTLE_CLASS_LABELS) as CattleClass[];

export const CATTLE_EVENT_LABELS: Record<CattleEventType, string> = {
  calving: 'Calving',
  weaning: 'Weaning',
  working: 'Worked cattle',
  preg_check: 'Preg check',
  death: 'Death',
  head_added: 'Head added',
  head_removed: 'Head removed',
  reclass: 'Change class',
  bull_in: 'Bulls in',
  bull_out: 'Bulls out',
};

export const CALF_SEX_LABELS: Record<CalfSex, string> = {
  heifer: 'Heifer calves',
  steer: 'Steer calves',
  bull: 'Bull calves',
};

export const CATTLE_REMOVAL_LABELS: Record<CattleRemovalReason, string> = {
  shipped: 'Shipped',
  moved_to_another_group: 'Moved to another group',
};

export const PASTURE_REMOVED_LABEL = 'Pasture removed';
export const OFF_PASTURE_LABEL = 'Off pasture';

export function duplicateGroupNameMessage(name: string): string {
  return `You already have a herd called "${name.trim()}". Pick a different name.`;
}

/** Case-insensitive match against live groups, ignoring the group being edited. */
export function findDuplicateGroupName(
  groups: Pick<CattleGroup, 'id' | 'name' | 'deleted_at'>[],
  name: string,
  excludeId?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;
  return groups.some(group => !group.deleted_at && group.id !== excludeId && group.name.trim().toLowerCase() === wanted);
}

/** A whole number of head, zero or more. Returns null for anything else. */
export function parseHeadCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Dates are compared as ISO day strings against the device's own today. */
export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}

interface PickerField { id: string; name: string; intendedUse?: string; deleted_at?: string | null }

export function isPastureField(field: Pick<PickerField, 'intendedUse'>): boolean {
  const use = (field.intendedUse ?? '').toLowerCase();
  return use.includes('pasture') || use.includes('hay') || use.includes('forage');
}

/** Pasture and hay fields first, then the rest, each sorted by name. Deleted fields are left out. */
export function orderFieldsForPicker<T extends PickerField>(fields: T[]): T[] {
  return fields
    .filter(field => !field.deleted_at)
    .sort((a, b) => Number(isPastureField(b)) - Number(isPastureField(a)) || a.name.localeCompare(b.name));
}

/** What to show for a group's or move's pasture. */
export function pastureLabel(fieldId: string | undefined, fields: PickerField[]): string {
  if (!fieldId) return OFF_PASTURE_LABEL;
  const field = fields.find(item => item.id === fieldId);
  return field && !field.deleted_at ? field.name : PASTURE_REMOVED_LABEL;
}


/** Head-change rule per event type, mirroring the database CHECK on cattle_events. */
export type EventHeadRule = 'positive' | 'negative' | 'none';
export const CATTLE_EVENT_HEAD_RULE: Record<CattleEventType, EventHeadRule> = {
  calving: 'positive',
  head_added: 'positive',
  death: 'negative',
  head_removed: 'negative',
  weaning: 'none',
  working: 'none',
  preg_check: 'none',
  reclass: 'none',
  bull_in: 'none',
  bull_out: 'none',
};

export const CATTLE_EVENT_TYPES = Object.keys(CATTLE_EVENT_LABELS) as CattleEventType[];

/** Timeline wording; a head transfer names the group on the other side. */
export function describeEvent(
  event: Pick<CattleEvent, 'id' | 'eventType' | 'headDelta' | 'transferId' | 'reason'>
    & Partial<Pick<CattleEvent, 'cattleClass' | 'toClass' | 'classHead' | 'calfSex' | 'bredCount' | 'openCount'
      | 'notCheckedCount' | 'exposedCount' | 'headWeaned' | 'avgWeight'>>,
  allEvents: Pick<CattleEvent, 'id' | 'groupId' | 'transferId' | 'deleted_at'>[],
  groups: Pick<CattleGroup, 'id' | 'name'>[],
): string {
  const what = (head: number) => event.cattleClass
    ? `${head} ${head === 1 ? COUNT_LABELS[event.cattleClass].one : COUNT_LABELS[event.cattleClass].many}`
    : `${head} head`;
  if (event.transferId) {
    const other = allEvents.find(item => item.transferId === event.transferId && item.id !== event.id && !item.deleted_at);
    const otherName = other ? groups.find(group => group.id === other.groupId)?.name : undefined;
    const head = Math.abs(event.headDelta);
    if (event.headDelta < 0) return `Moved ${what(head)}${otherName ? ` to ${otherName}` : ' to another group'}`;
    return `Received ${what(head)}${otherName ? ` from ${otherName}` : ' from another group'}`;
  }
  if (event.eventType === 'reclass' && event.cattleClass && event.toClass && event.classHead) {
    return `${what(event.classHead)} now ${COUNT_LABELS[event.toClass].many}`;
  }
  const label = CATTLE_EVENT_LABELS[event.eventType];
  if (event.eventType === 'preg_check' && event.bredCount !== undefined && event.openCount !== undefined) {
    const parts = [`${event.bredCount} bred`, `${event.openCount} open`];
    if (event.notCheckedCount) parts.push(`${event.notCheckedCount} not checked`);
    return `${label} (${parts.join(', ')})`;
  }
  if (event.eventType === 'bull_in' && event.exposedCount) {
    return `${label} (${event.exposedCount} exposed)`;
  }
  if (event.eventType === 'weaning' && event.headWeaned) {
    const weight = event.avgWeight ? `, avg ${Number(event.avgWeight.toFixed(1))} lb` : '';
    return `${label} (${event.headWeaned} weaned${weight})`;
  }
  if (event.headDelta === 0) return label;
  const sign = event.headDelta > 0 ? '+' : '-';
  const sex = event.eventType === 'calving' && event.calfSex ? `, ${CALF_SEX_LABELS[event.calfSex].toLowerCase()}` : '';
  // An event from before mixed herds has no class: keep the plain "(-1)".
  const amount = event.cattleClass ? what(Math.abs(event.headDelta)) : String(Math.abs(event.headDelta));
  return `${label} (${sign}${amount}${sex})`;
}
