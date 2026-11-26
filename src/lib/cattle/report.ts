import { Capacitor } from '@capacitor/core';
import { native } from '@/lib/native';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';
import { sanitizeCsvValue } from '@/utils/csv';
import { COUNT_CLASSES, COUNT_TITLES, groupCounts } from './counts';
import { CATTLE_CLASS_LABELS, CATTLE_EVENT_LABELS, CATTLE_REMOVAL_LABELS, pastureLabel } from './ui';

type Cell = string | number | null | undefined;

const NO_COUNTS: Cell[] = COUNT_CLASSES.map(() => '');

/** Herds, pasture moves and events in one file, using the shared formula-safe quoting. */
export function buildCattleCsv(
  groups: CattleGroup[],
  moves: CattleMove[],
  events: CattleEvent[],
  fields: { id: string; name: string; deleted_at?: string | null }[],
): string {
  const liveGroups = groups.filter(group => !group.deleted_at);
  const nameById = new Map(liveGroups.map(group => [group.id, group.name]));
  const classById = new Map(liveGroups.map(group => [group.id, CATTLE_CLASS_LABELS[group.class]]));
  const line = (cells: Cell[]) => cells.map(sanitizeCsvValue).join(',');
  const rows: string[] = [];

  for (const group of [...liveGroups].sort((a, b) => a.name.localeCompare(b.name))) {
    const counts = groupCounts(group);
    rows.push(line([
      'Group', group.name, CATTLE_CLASS_LABELS[group.class], group.currentSince ?? '',
      group.currentFieldId ? pastureLabel(group.currentFieldId, fields) : '', group.headCount, '', '', '', group.notes ?? '',
      '', ...COUNT_CLASSES.map(item => counts[item]),
    ]));
  }
  for (const move of moves.filter(item => !item.deleted_at && nameById.has(item.groupId))
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn))) {
    rows.push(line([
      'Move', nameById.get(move.groupId), classById.get(move.groupId), move.movedOn,
      pastureLabel(move.fieldId, fields), move.headCount, '', '', '', move.notes ?? '',
      '', ...NO_COUNTS,
    ]));
  }
  for (const event of events.filter(item => !item.deleted_at && nameById.has(item.groupId))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))) {
    const cattle = event.eventType === 'reclass' && event.cattleClass && event.toClass
      ? `${COUNT_TITLES[event.cattleClass]} to ${COUNT_TITLES[event.toClass]} (${event.classHead ?? ''})`
      : event.cattleClass ? COUNT_TITLES[event.cattleClass] : '';
    rows.push(line([
      'Event', nameById.get(event.groupId), classById.get(event.groupId), event.eventDate, '', '',
      event.headDelta, CATTLE_EVENT_LABELS[event.eventType], event.reason ? CATTLE_REMOVAL_LABELS[event.reason] : '',
      event.notes ?? '', cattle, ...NO_COUNTS,
    ]));
  }
  const header = [
    'Record,Group,Class,Date,Pasture,Head,Head Change,Event,Reason,Notes,Cattle',
    ...COUNT_CLASSES.map(item => COUNT_TITLES[item]),
  ].join(',');
  return [header, ...rows].join('\r\n');
}

export async function exportCattleCsv(csv: string, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await native.shareFile({ fileName, data: csv, title: 'AcreLedger cattle', encoding: 'utf8' });
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
