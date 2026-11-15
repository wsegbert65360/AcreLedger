import { describe, expect, it } from 'vitest';
import { mapCattleEventToDb, mapCattleGroupFromDb, mapCattleGroupToDb, mapCattleMoveToDb } from '@/lib/mappers';
import { mapCattleGroupToDbForRestore } from '@/lib/restoreMappers';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };

describe('cattle mappers', () => {
  it('maps nullable fields and always sends deleted_at explicitly', () => {
    const group: CattleGroup = { id: 'g1', farm_id: 'f1', name: 'Cows', class: 'cows', headCount: 10, ...timestamps, deleted_at: null };
    const move: CattleMove = { id: 'm1', farm_id: 'f1', groupId: 'g1', movedOn: '2026-01-01', headCount: 10, ...timestamps, deleted_at: null };
    const event: CattleEvent = { id: 'e1', farm_id: 'f1', groupId: 'g1', eventType: 'working', eventDate: '2026-01-01', headDelta: 0, ...timestamps, deleted_at: null };
    expect(mapCattleGroupToDb(group)).toMatchObject({ deleted_at: null, current_field_id: null, notes: null });
    expect(mapCattleMoveToDb(move)).toMatchObject({ deleted_at: null, field_id: null, notes: null });
    expect(mapCattleEventToDb(event)).toMatchObject({ deleted_at: null, reason: null, notes: null });
  });

  it('restores a tombstone as active when deleted_at is omitted', () => {
    const source = {
      id: 'g1', farm_id: 'f1', name: 'Cows', class: 'cows' as const, headCount: 10,
      ...timestamps, deleted_at: null,
    };
    expect(mapCattleGroupToDbForRestore(source)).toMatchObject({ id: 'g1', farm_id: 'f1', deleted_at: null });
  });

  it('maps database rows back to app shape', () => {
    expect(mapCattleGroupFromDb({
      id: 'g1', farm_id: 'f1', name: 'Cows', class: 'cows', head_count: 10,
      current_field_id: null, current_since: null, created_at: timestamps.createdAt,
      updated_at: timestamps.updatedAt, deleted_at: null,
    })).toMatchObject({ headCount: 10, deleted_at: null });
  });
});
