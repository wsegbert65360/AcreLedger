import { describe, expect, it } from 'vitest';
import { buildCattleCsvFiles } from '../export';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };

describe('cattle raw CSV', () => {
  it('exports every table and neutralizes spreadsheet formulas', () => {
    const groups: CattleGroup[] = [{ id: 'g1', farm_id: 'f1', name: '=cmd', class: 'cows', headCount: 12, ...timestamps }];
    const moves: CattleMove[] = [{ id: 'm1', farm_id: 'f1', groupId: 'g1', movedOn: '2026-01-01', headCount: 12, notes: '+unsafe', ...timestamps }];
    const events: CattleEvent[] = [{ id: 'e1', farm_id: 'f1', groupId: 'g1', eventType: 'working', eventDate: '2026-01-02', headDelta: 0, ...timestamps }];
    const csv = buildCattleCsvFiles(groups, moves, events);
    expect(csv.groups).toContain('"\'=cmd"');
    expect(csv.moves).toContain('"\'+unsafe"');
    expect(csv.events).toContain('"working"');
    expect(csv.groups).not.toMatch(/cost|price|dollar/i);
  });
});
