import { describe, expect, it } from 'vitest';
import { buildCattleCsv } from '../report';
import {
  describeEvent, findDuplicateGroupName, isFutureDate, orderFieldsForPicker, parseHeadCount, pastureLabel,
} from '../ui';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };
const group = (over: Partial<CattleGroup>): CattleGroup => ({ ...base, id: 'g1', name: 'Cows', class: 'cows', headCount: 10, ...over });

describe('cattle ui helpers', () => {
  it('accepts only whole head counts of zero or more', () => {
    expect(parseHeadCount('12')).toBe(12);
    expect(parseHeadCount(' 0 ')).toBe(0);
    for (const bad of ['', '-1', '1.5', '1e3', 'ten', '12 head']) expect(parseHeadCount(bad)).toBeNull();
  });

  it('flags dates after the device day only', () => {
    expect(isFutureDate('2026-11-15', '2026-11-14')).toBe(true);
    expect(isFutureDate('2026-11-14', '2026-11-14')).toBe(false);
    expect(isFutureDate('2026-01-01', '2026-11-14')).toBe(false);
  });

  it('finds duplicate names case-insensitively, skipping itself and deleted groups', () => {
    const groups = [group({}), group({ id: 'g2', name: 'Old', deleted_at: '2026-02-01' })];
    expect(findDuplicateGroupName(groups, ' cows ')).toBe(true);
    expect(findDuplicateGroupName(groups, 'Cows', 'g1')).toBe(false);
    expect(findDuplicateGroupName(groups, 'old')).toBe(false);
    expect(findDuplicateGroupName(groups, '  ')).toBe(false);
  });

  it('lists pasture and hay fields first and hides deleted fields', () => {
    const ordered = orderFieldsForPicker([
      { id: 'a', name: 'Alpha', intendedUse: 'Corn' },
      { id: 'b', name: 'Zed Pasture', intendedUse: 'Pasture' },
      { id: 'c', name: 'Hay Lot', intendedUse: 'Hay' },
      { id: 'd', name: 'Gone', intendedUse: 'Pasture', deleted_at: '2026-01-01' },
    ]);
    expect(ordered.map(field => field.id)).toEqual(['c', 'b', 'a']);
  });

  it('labels a missing or deleted pasture as removed', () => {
    const fields = [{ id: 'f1', name: 'North' }, { id: 'f2', name: 'South', deleted_at: '2026-01-01' }];
    expect(pastureLabel('f1', fields)).toBe('North');
    expect(pastureLabel('f2', fields)).toBe('Pasture removed');
    expect(pastureLabel('zzz', fields)).toBe('Pasture removed');
    expect(pastureLabel(undefined, fields)).toBe('Off pasture');
  });
});

describe('buildCattleCsv', () => {
  it('writes groups, moves and events and neutralises formulas', () => {
    const groups = [group({ name: '=SUM(A1)', currentFieldId: 'f1', currentSince: '2026-03-01' })];
    const moves: CattleMove[] = [{ ...base, id: 'm1', groupId: 'g1', fieldId: 'f1', movedOn: '2026-03-01', headCount: 10 }];
    const events: CattleEvent[] = [{
      ...base, id: 'e1', groupId: 'g1', eventType: 'head_removed', eventDate: '2026-04-01', headDelta: -2, reason: 'shipped',
    }];
    const csv = buildCattleCsv(groups, moves, events, [{ id: 'f1', name: 'North' }]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Record,Group,Class,Date,Pasture,Head,Head Change,Event,Reason,Notes');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(`"'=SUM(A1)"`);
    expect(lines[3]).toContain('"Head removed","Shipped"');
  });

  it('leaves out deleted rows and rows of deleted groups', () => {
    const groups = [group({ deleted_at: '2026-02-01' })];
    const moves: CattleMove[] = [{ ...base, id: 'm1', groupId: 'g1', movedOn: '2026-03-01', headCount: 10 }];
    expect(buildCattleCsv(groups, moves, [], []).split('\r\n')).toHaveLength(1);
  });
});


describe('describeEvent', () => {
  const groups = [{ id: 'g1', name: 'Cows' }, { id: 'g2', name: 'Calves' }];
  const halves = [
    { id: 'a', groupId: 'g1', transferId: 'a', deleted_at: null },
    { id: 'b', groupId: 'g2', transferId: 'a', deleted_at: null },
  ];
  it('names the other group for both halves of a transfer', () => {
    expect(describeEvent({ id: 'a', eventType: 'head_removed', headDelta: -4, transferId: 'a' }, halves, groups)).toBe('Moved 4 head to Calves');
    expect(describeEvent({ id: 'b', eventType: 'head_added', headDelta: 4, transferId: 'a' }, halves, groups)).toBe('Received 4 head from Cows');
  });
  it('labels plain events with their head change', () => {
    expect(describeEvent({ id: 'x', eventType: 'death', headDelta: -1 }, [], groups)).toBe('Death (-1)');
    expect(describeEvent({ id: 'y', eventType: 'working', headDelta: 0 }, [], groups)).toBe('Worked cattle');
  });
});
