import { downloadFile } from '@/lib/downloadFile';
import type { CattleEvent, CattleGroup, CattleMove, CattleTreatment } from '@/types/cattle';
import { sanitizeCsvValue } from '@/utils/csv';
import { COUNT_CLASSES, COUNT_TITLES, groupCounts } from './counts';
import { describeDose, ROUTE_SHORT, TREATMENT_KIND_LABELS } from './health';
import { CATTLE_CLASS_LABELS, CATTLE_EVENT_LABELS, pastureLabel, reasonLabel } from './ui';

type Cell = string | number | null | undefined;

const NO_COUNTS: Cell[] = COUNT_CLASSES.map(() => '');

/** Columns added after the class counts: treatment detail, then preg, breeding and weaning numbers. */
const EXTRA_HEADERS = [
  'Product', 'Treatment Type', 'Dose', 'Route', 'Withdrawal Days', 'Withdrawal Until', 'Lot Number', 'Given By',
  'Bred', 'Open', 'Not Checked', 'Exposed', 'Head Weaned', 'Avg Weight',
];
const NO_EXTRA: Cell[] = EXTRA_HEADERS.map(() => '');

/** Herds, pasture moves, events and treatments in one file, using the shared formula-safe quoting. */
export function buildCattleCsv(
  groups: CattleGroup[],
  moves: CattleMove[],
  events: CattleEvent[],
  fields: { id: string; name: string; deleted_at?: string | null }[],
  treatments: CattleTreatment[] = [],
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
      '', ...COUNT_CLASSES.map(item => counts[item]), ...NO_EXTRA,
    ]));
  }
  for (const move of moves.filter(item => !item.deleted_at && nameById.has(item.groupId))
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn))) {
    rows.push(line([
      'Move', nameById.get(move.groupId), classById.get(move.groupId), move.movedOn,
      pastureLabel(move.fieldId, fields), move.headCount, '', '', '', move.notes ?? '',
      '', ...NO_COUNTS, ...NO_EXTRA,
    ]));
  }
  for (const event of events.filter(item => !item.deleted_at && nameById.has(item.groupId))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))) {
    const cattle = event.eventType === 'reclass' && event.cattleClass && event.toClass
      ? `${COUNT_TITLES[event.cattleClass]} to ${COUNT_TITLES[event.toClass]} (${event.classHead ?? ''})`
      : event.cattleClass ? COUNT_TITLES[event.cattleClass] : '';
    rows.push(line([
      'Event', nameById.get(event.groupId), classById.get(event.groupId), event.eventDate, '', '',
      event.headDelta, CATTLE_EVENT_LABELS[event.eventType], reasonLabel(event.reason),
      event.notes ?? '', cattle, ...NO_COUNTS,
      '', '', '', '', '', '', '', '',
      event.bredCount ?? '', event.openCount ?? '', event.notCheckedCount ?? '', event.exposedCount ?? '',
      event.headWeaned ?? '', event.avgWeight ?? '',
    ]));
  }
  for (const item of treatments.filter(row => !row.deleted_at && nameById.has(row.groupId))
    .sort((a, b) => b.treatedOn.localeCompare(a.treatedOn))) {
    rows.push(line([
      'Treatment', nameById.get(item.groupId), classById.get(item.groupId), item.treatedOn, '', item.headTreated,
      '', '', '', item.notes ?? '', item.cattleClass ? COUNT_TITLES[item.cattleClass] : '', ...NO_COUNTS,
      item.product, TREATMENT_KIND_LABELS[item.kind], describeDose(item).replace(` ${ROUTE_SHORT[item.route]}`, ''),
      ROUTE_SHORT[item.route], item.withdrawalDays, item.withdrawalUntil, item.lotNumber ?? '', item.givenBy ?? '',
      '', '', '', '', '', '',
    ]));
  }
  const header = [
    'Record,Group,Class,Date,Pasture,Head,Head Change,Event,Reason,Notes,Cattle',
    ...COUNT_CLASSES.map(item => COUNT_TITLES[item]),
    ...EXTRA_HEADERS,
  ].join(',');
  return [header, ...rows].join('\r\n');
}

export async function exportCattleCsv(csv: string, fileName: string): Promise<void> {
  await downloadFile(csv, fileName, 'text/csv;charset=utf-8', 'AcreLedger cattle');
}
