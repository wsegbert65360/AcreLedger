import { describe, expect, it } from 'vitest';
import { daysOnCurrentPasture, grazingTotalsByField, restDaysSinceLastGrazed } from '../derived';
import type { CattleMove } from '@/types/cattle';

let seq = 0;
function move(groupId: string, fieldId: string | undefined, movedOn: string, headCount: number, extra: Partial<CattleMove> = {}): CattleMove {
  seq += 1;
  return {
    id: `m${seq}`, farm_id: 'farm', groupId, fieldId, movedOn, headCount,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`, updatedAt: '2026-01-01T00:00:00Z', deleted_at: null, ...extra,
  };
}

describe('daysOnCurrentPasture', () => {
  it('counts whole days since the group moved onto its current field', () => {
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: '2026-03-01' }, '2026-03-11')).toBe(10);
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: '2026-03-11' }, '2026-03-11')).toBe(0);
  });
  it('is zero with no current field or when the date is in the future', () => {
    expect(daysOnCurrentPasture({ currentFieldId: undefined, currentSince: '2026-03-01' }, '2026-03-11')).toBe(0);
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: undefined }, '2026-03-11')).toBe(0);
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: '2026-03-12' }, '2026-03-11')).toBe(0);
  });
  it('is not shifted by daylight saving changes', () => {
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: '2026-03-07' }, '2026-03-09')).toBe(2);
    expect(daysOnCurrentPasture({ currentFieldId: 'f1', currentSince: '2026-10-31' }, '2026-11-02')).toBe(2);
  });
});

describe('grazingTotalsByField', () => {
  it('sums grazing days and head-days per field across moves', () => {
    const moves = [
      move('g1', 'north', '2026-04-01', 20),
      move('g1', 'south', '2026-04-11', 20),
      move('g1', 'north', '2026-04-21', 20),
    ];
    expect(grazingTotalsByField(moves, '2026-04-26')).toEqual({
      north: { grazingDays: 15, headDays: 300 },
      south: { grazingDays: 10, headDays: 200 },
    });
  });
  it('adds up separate groups on the same field', () => {
    const moves = [
      move('g1', 'north', '2026-04-01', 10),
      move('g2', 'north', '2026-04-03', 5),
    ];
    expect(grazingTotalsByField(moves, '2026-04-11')).toEqual({ north: { grazingDays: 18, headDays: 100 + 40 } });
  });
  it('ends grazing at a drylot or off-farm move and ignores it as a field', () => {
    const moves = [move('g1', 'north', '2026-04-01', 10), move('g1', undefined, '2026-04-06', 10)];
    expect(grazingTotalsByField(moves, '2026-05-01')).toEqual({ north: { grazingDays: 5, headDays: 50 } });
  });
  it('skips deleted moves and does not count past the as-of date', () => {
    const moves = [
      move('g1', 'north', '2026-04-01', 10),
      move('g1', 'south', '2026-04-05', 10, { deleted_at: '2026-04-06T00:00:00Z' }),
      move('g1', 'south', '2026-05-10', 10),
    ];
    expect(grazingTotalsByField(moves, '2026-05-02')).toEqual({ north: { grazingDays: 31, headDays: 310 } });
  });
  it('orders a back-dated move by date, not by when it was entered', () => {
    const moves = [
      move('g1', 'south', '2026-04-10', 10),
      move('g1', 'north', '2026-04-01', 10),
    ];
    expect(grazingTotalsByField(moves, '2026-04-20')).toEqual({
      north: { grazingDays: 9, headDays: 90 },
      south: { grazingDays: 10, headDays: 100 },
    });
  });
  it('uses the head count recorded at the time of each move', () => {
    const moves = [move('g1', 'north', '2026-04-01', 10), move('g1', 'south', '2026-04-03', 14)];
    expect(grazingTotalsByField(moves, '2026-04-05').north).toEqual({ grazingDays: 2, headDays: 20 });
    expect(grazingTotalsByField(moves, '2026-04-05').south).toEqual({ grazingDays: 2, headDays: 28 });
  });
  it('is empty with no moves', () => {
    expect(grazingTotalsByField([], '2026-04-05')).toEqual({});
  });
});

describe('restDaysSinceLastGrazed', () => {
  it('counts days since the last group left the field', () => {
    const moves = [move('g1', 'north', '2026-04-01', 10), move('g1', 'south', '2026-04-11', 10)];
    expect(restDaysSinceLastGrazed('north', moves, '2026-04-21')).toBe(10);
  });
  it('is zero while a group is still on the field', () => {
    const moves = [move('g1', 'north', '2026-04-01', 10)];
    expect(restDaysSinceLastGrazed('north', moves, '2026-04-21')).toBe(0);
  });
  it('is null when the field was never grazed', () => {
    expect(restDaysSinceLastGrazed('north', [move('g1', 'south', '2026-04-01', 10)], '2026-04-21')).toBeNull();
    expect(restDaysSinceLastGrazed('north', [], '2026-04-21')).toBeNull();
  });
  it('uses the most recent exit across groups, and zero if any group is still there', () => {
    const moves = [
      move('g1', 'north', '2026-04-01', 10), move('g1', 'south', '2026-04-05', 10),
      move('g2', 'north', '2026-04-08', 10), move('g2', 'south', '2026-04-15', 10),
    ];
    expect(restDaysSinceLastGrazed('north', moves, '2026-04-20')).toBe(5);
    const stillThere = [...moves, move('g3', 'north', '2026-04-18', 5)];
    expect(restDaysSinceLastGrazed('north', stillThere, '2026-04-20')).toBe(0);
  });
  it('ignores deleted moves and a move entered ahead of the as-of date', () => {
    const moves = [
      move('g1', 'north', '2026-04-01', 10),
      move('g1', 'south', '2026-04-05', 10, { deleted_at: '2026-04-06T00:00:00Z' }),
    ];
    expect(restDaysSinceLastGrazed('north', moves, '2026-04-21')).toBe(0);
    const future = [move('g1', 'north', '2026-04-01', 10), move('g1', 'south', '2026-04-30', 10)];
    expect(restDaysSinceLastGrazed('north', future, '2026-04-21')).toBe(0);
  });
  it('counts a move to a drylot as leaving the field', () => {
    const moves = [move('g1', 'north', '2026-04-01', 10), move('g1', undefined, '2026-04-06', 10)];
    expect(restDaysSinceLastGrazed('north', moves, '2026-04-16')).toBe(10);
  });
});
