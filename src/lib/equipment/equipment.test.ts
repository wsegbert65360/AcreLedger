import { describe, expect, it, vi } from 'vitest';
import type { Equipment, MaintenanceLog, MaintenanceSchedule } from '@/types/equipment';
import {
  applyReadingUpdate,
  computeDueStatus,
  convertMeterUnit,
  costTotals,
  getKindIcon,
  resolveBrandColor,
  summarizeEquipmentStatus,
} from '.';

const equipment: Equipment = {
  id: 'equipment-1', farm_id: 'farm-1', kind: 'tractor', make: 'John Deere', meterUnit: 'hours',
  currentReading: 1_000, status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z', deleted_at: null,
};

function schedule(overrides: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule {
  return {
    id: 'schedule-1', farm_id: 'farm-1', equipmentId: equipment.id, taskName: 'Oil change',
    intervalValue: 250, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', deleted_at: null, ...overrides,
  };
}

function log(overrides: Partial<MaintenanceLog> = {}): MaintenanceLog {
  return {
    id: crypto.randomUUID(), farm_id: 'farm-1', equipmentId: equipment.id, kind: 'service',
    performedOn: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', deleted_at: null, ...overrides,
  };
}

describe('computeDueStatus', () => {
  it('uses a stored last-done snapshot rather than the live meter', () => {
    expect(computeDueStatus(schedule({ lastDoneReading: 1000 }), equipment, '2026-01-01')).toEqual({
      status: 'ok', remainingReading: 250, remainingDays: undefined,
    });
    expect(computeDueStatus(
      schedule({ lastDoneReading: 1000 }),
      { ...equipment, currentReading: 1250 },
      '2026-01-01',
    ).status).toBe('overdue');
  });

  it('does not let a missing snapshot track a rising live meter', () => {
    expect(computeDueStatus(
      schedule(),
      { ...equipment, currentReading: 2000 },
      '2026-01-01',
    )).toEqual({
      status: 'ok', remainingReading: 250, remainingDays: undefined,
    });
  });

  it('marks the exact reading boundary overdue and ten percent due soon', () => {
    expect(computeDueStatus(schedule({ lastDoneReading: 750 }), equipment, '2026-01-01').status).toBe('overdue');
    expect(computeDueStatus(schedule({ lastDoneReading: 775 }), equipment, '2026-01-01').status).toBe('due_soon');
  });

  it('uses the local schedule-creation date until calendar service is recorded', () => {
    const result = computeDueStatus(
      schedule({ intervalValue: undefined, intervalDays: 100 }),
      equipment,
      '2026-04-01',
    );
    const created = new Date(schedule().createdAt);
    const createdDay = Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
    const elapsedDays = (Date.UTC(2026, 3, 1) - createdDay) / 86_400_000;
    expect(result).toEqual({ status: 'due_soon', remainingReading: undefined, remainingDays: 100 - elapsedDays });
  });

  it('keeps the local calendar date when UTC has already rolled over', () => {
    expect(computeDueStatus(
      schedule({ intervalValue: undefined, intervalDays: 1, lastDoneAt: '2026-04-01' }),
      equipment,
      '2026-04-01',
    ).remainingDays).toBe(1);
  });

  it('handles year rollover and chooses the worse of both rules', () => {
    const result = computeDueStatus(
      schedule({ intervalValue: 250, lastDoneReading: 900, intervalDays: 30, lastDoneAt: '2025-12-15' }),
      equipment,
      '2026-01-14',
    );
    expect(result.status).toBe('overdue');
    expect(result.remainingDays).toBe(0);
    expect(result.remainingReading).toBe(150);
  });
});

describe('summarizeEquipmentStatus', () => {
  it('returns the worst and most urgent active task', () => {
    const result = summarizeEquipmentStatus([
      schedule({ id: 'a', taskName: 'Oil', lastDoneReading: 800 }),
      schedule({ id: 'b', taskName: 'Filter', lastDoneReading: 700 }),
      schedule({ id: 'c', taskName: 'Deleted', lastDoneReading: 0, deleted_at: '2026-01-01' }),
    ], equipment, '2026-05-01');
    expect(result).toEqual({ status: 'overdue', taskName: 'Filter' });
  });

  it('returns ok with no task for an empty list', () => {
    expect(summarizeEquipmentStatus([], equipment, '2026-01-01')).toEqual({ status: 'ok' });
  });
});

describe('convertMeterUnit', () => {
  it('converts miles and kilometres with a one-decimal round trip', () => {
    const km = convertMeterUnit(10, 'miles', 'km');
    expect(km).toBe(16.1);
    expect(convertMeterUnit(km!, 'km', 'miles')).toBe(10);
  });

  it('does not convert hours to distance', () => {
    expect(convertMeterUnit(10, 'hours', 'miles')).toBeNull();
    expect(convertMeterUnit(10, 'km', 'hours')).toBeNull();
  });
});

describe('applyReadingUpdate', () => {
  it('warns before a reading regression and applies it only when forced', () => {
    expect(applyReadingUpdate(equipment, 900, { force: false })).toMatchObject({
      status: 'warning', requestedReading: 900,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    expect(applyReadingUpdate(equipment, 900, { force: true })).toMatchObject({
      status: 'applied', equipment: { currentReading: 900, readingUpdatedAt: '2026-06-01T00:00:00.000Z' },
    });
    vi.useRealTimers();
  });

  it('rejects negative and non-finite readings', () => {
    expect(applyReadingUpdate(equipment, -1, { force: true }).status).toBe('invalid');
    expect(applyReadingUpdate(equipment, Number.NaN, { force: true }).status).toBe('invalid');
  });
});

describe('equipment identity helpers', () => {
  it('normalizes brand names and returns null for unknown makes', () => {
    expect(resolveBrandColor('  JOHN-DEERE  ')).toBe('#367C2B');
    expect(resolveBrandColor('Case I.H.')).toBe('#C8102E');
    expect(resolveBrandColor('Acme')).toBeNull();
    expect(resolveBrandColor(undefined)).toBeNull();
  });

  it('returns a stable icon key for every kind', () => {
    expect(getKindIcon('combine')).toBe('combine');
    expect(getKindIcon('other')).toBe('other');
  });
});

describe('costTotals', () => {
  it('totals routine and repair costs by equipment and year with nulls as zero', () => {
    const totals = costTotals([
      log({ costParts: 10.25, costLabor: 20, kind: 'service', performedOn: '2025-12-30' }),
      log({ costParts: undefined, costLabor: 5.5, kind: 'repair', performedOn: '2026-01-02' }),
      log({ equipmentId: 'equipment-2', kind: 'repair', performedOn: '2026-02-01' }),
      log({ costParts: 999, deleted_at: '2026-03-01' }),
    ]);
    expect(totals['equipment-1'].allTime).toEqual({ service: 30.25, repair: 5.5, total: 35.75 });
    expect(totals['equipment-1'].byYear[2025].total).toBe(30.25);
    expect(totals['equipment-1'].byYear[2026].repair).toBe(5.5);
    expect(totals['equipment-2'].allTime.total).toBe(0);
  });
});
