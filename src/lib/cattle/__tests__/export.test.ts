import { describe, expect, it } from 'vitest';
import { buildCattleCsvFiles } from '../export';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const timestamps = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };

describe('cattle raw CSV', () => {
  it('exports every table and neutralizes spreadsheet formulas', () => {
    const groups: CattleGroup[] = [{ id: 'g1', farm_id: 'f1', name: '=cmd', class: 'cows', headCount: 12, counts: { cows: 12, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 }, ...timestamps }];
    const moves: CattleMove[] = [{ id: 'm1', farm_id: 'f1', groupId: 'g1', movedOn: '2026-01-01', headCount: 12, notes: '+unsafe', ...timestamps }];
    const events: CattleEvent[] = [{ id: 'e1', farm_id: 'f1', groupId: 'g1', eventType: 'working', eventDate: '2026-01-02', headDelta: 0, ...timestamps }];
    const csv = buildCattleCsvFiles(groups, moves, events);
    expect(csv.groups).toContain('"\'=cmd"');
    expect(csv.moves).toContain('"\'+unsafe"');
    expect(csv.events).toContain('"working"');
    expect(csv.events.split('\r\n')[0]).toContain('"transfer_id"');
    expect(csv.groups).not.toMatch(/cost|price|dollar/i);
  });

  it('keeps the transfer id that links the two halves of a head move', () => {
    const half: CattleEvent = {
      id: 'e2', farm_id: 'f1', groupId: 'g1', eventType: 'head_removed', eventDate: '2026-01-03', headDelta: -4,
      reason: 'moved_to_another_group', transferId: 'e2', ...timestamps,
    };
    const row = buildCattleCsvFiles([], [], [half]).events.split('\r\n')[1];
    expect(row).toContain('"moved_to_another_group","e2"');
  });

  it('exports the class counts and which class an event changed', () => {
    const herd: CattleGroup = {
      id: 'g1', farm_id: 'f1', name: 'Herd', class: 'mixed', headCount: 41,
      counts: { cows: 30, heifers: 0, bulls: 1, calves: 10, steers: 0, stockers: 0 }, ...timestamps,
    };
    const death: CattleEvent = {
      id: 'e3', farm_id: 'f1', groupId: 'g1', eventType: 'death', eventDate: '2026-01-04', headDelta: -1, cattleClass: 'calves', ...timestamps,
    };
    const files = buildCattleCsvFiles([herd], [], [death]);
    expect(files.groups.split('\r\n')[0]).toContain('"head_count","cows","heifers","bulls","calves","steers","stockers"');
    expect(files.groups.split('\r\n')[1]).toContain('"41","30","0","1","10","0","0"');
    expect(files.events.split('\r\n')[1]).toContain('"calves"');
  });
});
