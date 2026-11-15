import { describe, expect, it } from 'vitest';
import { daysOnCurrentPasture, grazingTotalsByField, restDaysSinceLastGrazed } from '../derived';
import type { CattleMove } from '@/types/cattle';

const move = (id: string, groupId: string, fieldId: string | undefined, movedOn: string, headCount: number): CattleMove => ({
  id, groupId, fieldId, movedOn, headCount, farm_id: 'farm-1',
  createdAt: `${movedOn}T12:00:00Z`, updatedAt: `${movedOn}T12:00:00Z`, deleted_at: null,
});

describe('cattle grazing derivations', () => {
  it('calculates elapsed days on the current pasture', () => {
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: '2026-03-01' }, '2026-03-11')).toBe(10);
    expect(daysOnCurrentPasture({ currentSince: '2026-03-01' }, '2026-03-11')).toBe(0);
  });

  it('totals grazing days and head-days by field across groups', () => {
    const moves = [
      move('m1', 'g1', 'f1', '2026-03-01', 10),
      move('m2', 'g1', 'f2', '2026-03-06', 10),
      move('m3', 'g2', 'f1', '2026-03-03', 5),
      move('m4', 'g2', undefined, '2026-03-08', 5),
    ];
    expect(grazingTotalsByField(moves, '2026-03-11')).toEqual({
      f1: { grazingDays: 10, headDays: 75 },
      f2: { grazingDays: 5, headDays: 50 },
    });
  });

  it('reports zero for a currently grazed field and elapsed rest after exit', () => {
    const moves = [
      move('m1', 'g1', 'f1', '2026-03-01', 10),
      move('m2', 'g1', 'f2', '2026-03-06', 10),
    ];
    expect(restDaysSinceLastGrazed('f1', moves, '2026-03-11')).toBe(5);
    expect(restDaysSinceLastGrazed('f2', moves, '2026-03-11')).toBe(0);
    expect(restDaysSinceLastGrazed('never', moves, '2026-03-11')).toBeNull();
  });
});
