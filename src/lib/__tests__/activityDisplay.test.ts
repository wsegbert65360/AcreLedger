import { describe, expect, it } from 'vitest';
import type { GrainMovement, HarvestRecord } from '@/types/farm';
import { grainCardText, harvestCardText, mirroredGrainIds, formatWorkDateTime } from '@/lib/activityDisplay';
import { localDateTimeMs } from '@/utils/dates';

const ts = localDateTimeMs('2026-10-10', '11:30');

const harvest = (over: Partial<HarvestRecord> = {}): HarvestRecord => ({
  id: 'h1', fieldId: 'f1', fieldName: 'Grandma Bins/Hwy', destination: 'bin', binId: 'b1',
  moisturePercent: 11, landlordSplitPercent: 0, bushels: 200, timestamp: ts, seasonYear: 2026,
  crop: 'Soybean', harvestDate: '2026-10-10', farm_id: 'farm', deleted_at: null, ...over,
});

const move = (over: Partial<GrainMovement> = {}): GrainMovement => ({
  id: 'g1', binId: 'b1', binName: 'Bin 1', type: 'in', bushels: 200, moisturePercent: 11,
  sourceFieldName: 'Grandma Bins/Hwy', timestamp: ts, seasonYear: 2026, farm_id: 'farm',
  deleted_at: null, harvestRecordId: 'h1', ...over,
});

describe('activityDisplay', () => {
  it('harvest and its bin movement read the same way', () => {
    const h = harvestCardText(harvest(), 'Bin 1');
    const g = grainCardText(move());
    expect(h.subtitle).toBe('Soybean · 200 BU');
    expect(h.details).toBe('11% moisture · to Bin 1');
    expect(g.subtitle).toBe('In · 200 BU');
    expect(g.details).toBe('11% moisture · from Grandma Bins/Hwy');
    expect(h.date).toBe(g.date);
  });

  it('harvest to town and ticket number', () => {
    const h = harvestCardText(harvest({ destination: 'town', binId: undefined, scaleTicketNumber: '42' }));
    expect(h.details).toBe('11% moisture · to town · Ticket 42');
  });

  it('shows only the date when the timestamp is a different day', () => {
    const other = localDateTimeMs('2026-10-12', '08:00');
    expect(formatWorkDateTime('2026-10-10', other)).not.toMatch(/\d:\d\d/);
  });

  it('hides only movements whose harvest is in the list', () => {
    const ids = mirroredGrainIds([harvest()], [move(), move({ id: 'g2', harvestRecordId: undefined }), move({ id: 'g3', harvestRecordId: 'other' })]);
    expect([...ids]).toEqual(['g1']);
  });
});
