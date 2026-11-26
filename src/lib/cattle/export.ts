import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';
import { sanitizeCsvValue } from '@/utils/csv';
import { COUNT_CLASSES, groupCounts } from './counts';

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(sanitizeCsvValue).join(',');
}

export interface CattleCsvFiles {
  groups: string;
  moves: string;
  events: string;
}

/** Raw, lossless cattle exports. Tombstones remain included for recovery/audit. */
export function buildCattleCsvFiles(
  groups: CattleGroup[],
  moves: CattleMove[],
  events: CattleEvent[],
): CattleCsvFiles {
  return {
    groups: [
      csvRow(['id', 'farm_id', 'name', 'class', 'head_count', ...COUNT_CLASSES, 'current_field_id', 'current_since', 'notes', 'created_at', 'updated_at', 'deleted_at']),
      ...groups.map(item => {
        const counts = groupCounts(item);
        return csvRow([
          item.id, item.farm_id, item.name, item.class, item.headCount, ...COUNT_CLASSES.map(cls => counts[cls]),
          item.currentFieldId, item.currentSince, item.notes, item.createdAt, item.updatedAt, item.deleted_at,
        ]);
      }),
    ].join('\r\n'),
    moves: [
      csvRow(['id', 'farm_id', 'group_id', 'field_id', 'moved_on', 'head_count', 'notes', 'created_at', 'updated_at', 'deleted_at']),
      ...moves.map(item => csvRow([
        item.id, item.farm_id, item.groupId, item.fieldId, item.movedOn, item.headCount,
        item.notes, item.createdAt, item.updatedAt, item.deleted_at,
      ])),
    ].join('\r\n'),
    events: [
      csvRow(['id', 'farm_id', 'group_id', 'event_type', 'event_date', 'head_delta', 'reason', 'transfer_id', 'cattle_class', 'to_class', 'class_head', 'calf_sex', 'notes', 'created_at', 'updated_at', 'deleted_at']),
      ...events.map(item => csvRow([
        item.id, item.farm_id, item.groupId, item.eventType, item.eventDate, item.headDelta,
        item.reason, item.transferId, item.cattleClass, item.toClass, item.classHead, item.calfSex,
        item.notes, item.createdAt, item.updatedAt, item.deleted_at,
      ])),
    ].join('\r\n'),
  };
}
