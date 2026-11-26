import { describe, expect, it } from 'vitest';
import {
  applyEventToGroup, calvingStats, countsFromRow, countsSummary, emptyCounts, femalesPerBull,
  normalizeCattleGroup, pairCount, resolveEventClass,
} from '../counts';
import type { CattleEvent, CattleGroup } from '@/types/cattle';

const zero = emptyCounts();
const herd = { class: 'mixed' as const, headCount: 41, counts: { ...zero, cows: 30, calves: 10, bulls: 1 } };

describe('cattle class counts', () => {
  it('gives a pre-mixed-herd row or cache its whole count on its herd type', () => {
    expect(countsFromRow({}, 'bulls', 2)).toEqual({ ...zero, bulls: 2 });
    expect(countsFromRow({}, 'replacement_heifers', 5)).toEqual({ ...zero, heifers: 5 });
    expect(countsFromRow({}, 'mixed', 7)).toEqual({ ...zero, cows: 7 });
    expect(countsFromRow({ cows: 3, bulls: 1 }, 'cows', 99)).toEqual({ ...zero, cows: 3, bulls: 1 });
    const cached = { class: 'calves', headCount: 4 } as unknown as CattleGroup;
    expect(normalizeCattleGroup(cached)).toMatchObject({ headCount: 4, counts: { ...zero, calves: 4 } });
  });

  it('resolves the class an event hits the way the server does', () => {
    expect(resolveEventClass('calving', 3, 'cows', 'cows')).toBe('calves');
    expect(resolveEventClass('death', -1, undefined, 'bulls')).toBe('bulls');
    expect(resolveEventClass('death', -1, 'calves', 'mixed')).toBe('calves');
    expect(resolveEventClass('working', 0, 'cows', 'mixed')).toBeUndefined();
  });

  it('applies and reverses events on one class, keeping the total the sum', () => {
    const death = { eventType: 'death', headDelta: -1, cattleClass: 'calves' } as Pick<CattleEvent, 'eventType' | 'headDelta' | 'cattleClass'>;
    const after = applyEventToGroup(herd, death, 1);
    expect(after).toMatchObject({ headCount: 40, counts: { ...zero, cows: 30, calves: 9, bulls: 1 } });
    expect(applyEventToGroup(after, death, -1)).toMatchObject({ headCount: 41, counts: herd.counts });
    const reclass = { eventType: 'reclass', headDelta: 0, cattleClass: 'calves', toClass: 'heifers', classHead: 4 } as const;
    const moved = applyEventToGroup(herd, reclass, 1);
    expect(moved).toMatchObject({ headCount: 41, counts: { ...zero, cows: 30, calves: 6, heifers: 4, bulls: 1 } });
    expect(applyEventToGroup(moved, reclass, -1).counts).toEqual(herd.counts);
  });

  it('summarises a herd, its pairs and its bull ratio', () => {
    expect(countsSummary(herd.counts)).toBe('30 cows · 1 bull · 10 calves');
    expect(countsSummary(zero)).toBe('No head');
    expect(pairCount(herd.counts)).toBe(10);
    expect(femalesPerBull(herd.counts)).toBe(30);
    expect(femalesPerBull({ ...zero, cows: 5 })).toBeNull();
  });

  it('counts calves born and lost in a year', () => {
    const base = { groupId: 'g1', deleted_at: null, transferId: undefined };
    const events = [
      { ...base, eventType: 'calving', eventDate: '2026-03-01', headDelta: 24 },
      { ...base, eventType: 'death', eventDate: '2026-03-10', headDelta: -1, cattleClass: 'calves' },
      { ...base, eventType: 'death', eventDate: '2026-03-11', headDelta: -1, cattleClass: 'cows' },
      { ...base, eventType: 'calving', eventDate: '2025-03-01', headDelta: 20 },
      { ...base, eventType: 'calving', eventDate: '2026-04-01', headDelta: 5, deleted_at: '2026-04-02' },
    ] as Pick<CattleEvent, 'groupId' | 'eventType' | 'eventDate' | 'headDelta' | 'cattleClass' | 'deleted_at' | 'transferId'>[];
    expect(calvingStats({ id: 'g1', counts: herd.counts }, events, '2026')).toEqual({
      year: '2026', calvesBorn: 24, calvesLost: 1, calvingPercent: 80,
    });
  });
});
