import { describe, expect, it } from 'vitest';
import { buildCattleCsv } from '../report';
import {
  describeEvent, findDuplicateGroupName, isFutureDate, orderFieldsForPicker, parseHeadCount, pastureLabel,
} from '../ui';
import type { CattleEvent, CattleGroup, CattleMove } from '@/types/cattle';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };
const group = (over: Partial<CattleGroup>): CattleGroup => ({
  ...base, id: 'g1', name: 'Cows', class: 'cows', headCount: 10,
  counts: { cows: 10, heifers: 0, bulls: 0, calves: 0, steers: 0, stockers: 0 }, ...over,
});

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
    expect(lines[0]).toBe('Record,Group,Class,Date,Pasture,Head,Head Change,Event,Reason,Notes,Cattle,Cows,Heifers,Bulls,Calves,Steers,Stockers,Product,Treatment Type,Dose,Route,Withdrawal Days,Withdrawal Until,Lot Number,Given By,Bred,Open,Not Checked,Exposed,Head Weaned,Avg Weight');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(`"'=SUM(A1)"`);
    expect(lines[3]).toContain('"Head removed","Sold / shipped"');
  });

  it('writes a mixed herd with its class counts and the class an event changed', () => {
    const herd = group({
      name: '2014 herd', class: 'mixed', headCount: 41,
      counts: { cows: 30, heifers: 0, bulls: 1, calves: 10, steers: 0, stockers: 0 },
    });
    const death: CattleEvent = {
      ...base, id: 'e1', groupId: 'g1', eventType: 'death', eventDate: '2026-04-01', headDelta: -1, cattleClass: 'calves',
    };
    const lines = buildCattleCsv([herd], [], [death], []).split('\r\n');
    expect(lines[1]).toContain('"Cow-calf herd"');
    expect(lines[1]).toContain('"30","0","1","10","0","0"');
    expect(lines[2]).toContain('"Calves"');
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
    expect(describeEvent({ id: 'a', eventType: 'head_removed', headDelta: -4, transferId: 'a', cattleClass: 'calves' }, halves, groups)).toBe('Moved 4 calves to Calves');
  });
  it('labels plain events with their head change', () => {
    expect(describeEvent({ id: 'x', eventType: 'death', headDelta: -1 }, [], groups)).toBe('Death (-1)');
    expect(describeEvent({ id: 'y', eventType: 'working', headDelta: 0 }, [], groups)).toBe('Worked cattle');
  });
  it('names the class, calf sex and reclass', () => {
    expect(describeEvent({ id: 'x', eventType: 'death', headDelta: -1, cattleClass: 'calves' }, [], groups)).toBe('Death (-1 calf)');
    expect(describeEvent({ id: 'c', eventType: 'calving', headDelta: 3, cattleClass: 'calves', calfSex: 'heifer' }, [], groups)).toBe('Calving (+3 calves, heifer calves)');
    expect(describeEvent({
      id: 'r', eventType: 'reclass', headDelta: 0, cattleClass: 'calves', toClass: 'heifers', classHead: 2,
    }, [], groups)).toBe('2 calves now heifers');
  });
});
