import { describe, expect, it } from 'vitest';
import {
  mapCattleEventFromDb, mapCattleEventToDb, mapCattleGroupFromDb, mapCattleGroupToDb,
  mapCattleGroupUpdateToDb, mapCattleMoveToDb,
} from '@/lib/mappers';
import { mapCattleGroupToDbForRestore } from '@/lib/restoreMappers';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
const zero = { cows: 0, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 };
const cows = { ...zero, cows: 10 };

describe('cattle mappers', () => {
  it('maps nullable fields and always sends deleted_at explicitly', () => {
    const group: CattleGroup = { id: 'g1', farm_id: 'f1', name: 'Cows', class: 'cows', headCount: 10, counts: cows, ...timestamps, deleted_at: null };
    const move: CattleMove = { id: 'm1', farm_id: 'f1', groupId: 'g1', movedOn: '2026-01-01', headCount: 10, ...timestamps, deleted_at: null };
    const event: CattleEvent = { id: 'e1', farm_id: 'f1', groupId: 'g1', eventType: 'working', eventDate: '2026-01-01', headDelta: 0, ...timestamps, deleted_at: null };
    expect(mapCattleGroupToDb(group)).toMatchObject({ deleted_at: null, current_field_id: null, notes: null });
    expect(mapCattleMoveToDb(move)).toMatchObject({ deleted_at: null, field_id: null, notes: null });
    expect(mapCattleEventToDb(event)).toMatchObject({ deleted_at: null, reason: null, notes: null, cattle_class: null, calf_sex: null });
  });

  it('sends a tombstone value when one is set, on every mapper', () => {
    const deleted = '2026-02-01T00:00:00Z';
    const group: CattleGroup = { id: 'g1', farm_id: 'f1', name: 'Cows', class: 'cows', headCount: 10, counts: cows, ...timestamps, deleted_at: deleted };
    const move: CattleMove = { id: 'm1', farm_id: 'f1', groupId: 'g1', movedOn: '2026-01-01', headCount: 10, ...timestamps, deleted_at: deleted };
    const event: CattleEvent = { id: 'e1', farm_id: 'f1', groupId: 'g1', eventType: 'working', eventDate: '2026-01-01', headDelta: 0, ...timestamps, deleted_at: deleted };
    expect(mapCattleGroupToDb(group).deleted_at).toBe(deleted);
    expect(mapCattleGroupUpdateToDb(group).deleted_at).toBe(deleted);
    expect(mapCattleMoveToDb(move).deleted_at).toBe(deleted);
    expect(mapCattleEventToDb(event).deleted_at).toBe(deleted);
    const noTombstone = { ...group, deleted_at: undefined } as unknown as CattleGroup;
    expect(mapCattleGroupUpdateToDb(noTombstone)).toHaveProperty('deleted_at', null);
  });

  it('sends the class counts and their total on a group update only when the user changed one', () => {
    const herd: CattleGroup = {
      id: 'g1', farm_id: 'f1', name: 'Herd', class: 'mixed', headCount: 41,
      counts: { ...zero, cows: 30, calves: 10, bulls: 1 }, ...timestamps, deleted_at: null,
    };
    expect(mapCattleGroupUpdateToDb(herd)).not.toHaveProperty('head_count');
    expect(mapCattleGroupUpdateToDb(herd)).not.toHaveProperty('cows');
    expect(mapCattleGroupUpdateToDb(herd, { countsChanged: false })).not.toHaveProperty('bulls');
    expect(mapCattleGroupUpdateToDb(herd, { countsChanged: true })).toMatchObject({
      head_count: 41, cows: 30, calves: 10, bulls: 1, heifers: 0, steers: 0, stockers: 0,
    });
    expect(mapCattleGroupUpdateToDb(herd, { countsChanged: true })).not.toHaveProperty('farm_id');
  });

  it('inserts every class column with the total as their sum', () => {
    const herd: CattleGroup = {
      id: 'g1', farm_id: 'f1', name: 'Herd', class: 'mixed', headCount: 999,
      counts: { ...zero, cows: 30, bulls: 2 }, ...timestamps, deleted_at: null,
    };
    expect(mapCattleGroupToDb(herd)).toMatchObject({ head_count: 32, cows: 30, bulls: 2, calves: 0 });
  });

  it('round-trips transfer_id and the event class fields', () => {
    const event: CattleEvent = {
      id: 'e1', farm_id: 'f1', groupId: 'g1', eventType: 'head_removed', eventDate: '2026-01-01', headDelta: -3,
      reason: 'moved_to_another_group', transferId: 'e1', cattleClass: 'calves', ...timestamps, deleted_at: null,
    };
    const row = mapCattleEventToDb(event);
    expect(row).toMatchObject({ transfer_id: 'e1', reason: 'moved_to_another_group', cattle_class: 'calves' });
    expect(mapCattleEventFromDb(row as never)).toMatchObject({ transferId: 'e1', reason: 'moved_to_another_group', cattleClass: 'calves' });
    expect(mapCattleEventToDb({ ...event, transferId: undefined })).toHaveProperty('transfer_id', null);
    const reclass: CattleEvent = {
      id: 'e2', farm_id: 'f1', groupId: 'g1', eventType: 'reclass', eventDate: '2026-01-01', headDelta: 0,
      cattleClass: 'calves', toClass: 'heifers', classHead: 4, ...timestamps, deleted_at: null,
    };
    expect(mapCattleEventFromDb(mapCattleEventToDb(reclass) as never)).toMatchObject({ toClass: 'heifers', classHead: 4 });
  });

  it('restores a tombstone as active when deleted_at is omitted, and fills counts for an older backup', () => {
    const source = {
      id: 'g1', farm_id: 'f1', name: 'Cows', class: 'cows' as const, headCount: 10,
      ...timestamps, deleted_at: null,
    };
    const older = mapCattleGroupToDbForRestore(source as unknown as CattleGroup);
    // An older backup sends only the total; the database puts it on the herd type's class.
    expect(older).toMatchObject({ id: 'g1', farm_id: 'f1', deleted_at: null, head_count: 10 });
    expect(older).not.toHaveProperty('cows');
    const herd = { ...source, class: 'mixed' as const, headCount: 41, counts: { ...zero, cows: 30, calves: 10, bulls: 1 } };
    expect(mapCattleGroupToDbForRestore(herd)).toMatchObject({ head_count: 41, cows: 30, calves: 10, bulls: 1, heifers: 0 });
  });

  it('maps database rows back to app shape, and an older row without counts to its class', () => {
    expect(mapCattleGroupFromDb({
      id: 'g1', farm_id: 'f1', name: 'Bulls', class: 'bulls', head_count: 2,
      current_field_id: null, current_since: null, created_at: timestamps.createdAt,
      updated_at: timestamps.updatedAt, deleted_at: null,
    })).toMatchObject({ headCount: 2, counts: { ...zero, bulls: 2 }, deleted_at: null });
    expect(mapCattleGroupFromDb({
      id: 'g1', farm_id: 'f1', name: 'Herd', class: 'mixed', head_count: 41,
      cows: 30, heifers: 0, bulls: 1, calves: 10, steers: 0, stockers: 0,
      created_at: timestamps.createdAt, updated_at: timestamps.updatedAt, deleted_at: null,
    })).toMatchObject({ headCount: 41, counts: { ...zero, cows: 30, bulls: 1, calves: 10 } });
  });
});
