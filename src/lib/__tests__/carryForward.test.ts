import { describe, expect, it } from 'vitest';

import { formatCarryForwardTime, getCarryForwardSource } from '@/lib/carryForward';

type RecordStub = {
  id: string;
  fieldId: string;
  seasonYear: number;
  deleted_at: string | null;
  date: string;
  timestamp: number;
};

const record = (overrides: Partial<RecordStub> = {}): RecordStub => ({
  id: 'record-1',
  fieldId: 'field-a',
  seasonYear: 2026,
  deleted_at: null,
  date: '2026-09-19',
  timestamp: 100,
  ...overrides,
});

describe('getCarryForwardSource', () => {
  const options = { dateKey: 'date' as const, todayLocalIso: '2026-09-19' };

  it('selects the latest same-day, same-season record from another field', () => {
    const latest = record({ id: 'latest', fieldId: 'field-c', timestamp: 300 });
    const result = getCarryForwardSource([
      record({ id: 'older', timestamp: 200 }),
      latest,
      record({ id: 'same-field', fieldId: 'field-b', timestamp: 400 }),
    ], 'field-b', 2026, options);

    expect(result).toBe(latest);
  });

  it.each([
    ['a prior local day', { date: '2026-09-18' }],
    ['another season', { seasonYear: 2025 }],
    ['a soft-deleted record', { deleted_at: '2026-09-19T12:00:00Z' }],
  ])('excludes %s', (_label, overrides) => {
    expect(getCarryForwardSource([record(overrides)], 'field-b', 2026, options)).toBeNull();
  });

  it('returns null when the farm only has records for the current field', () => {
    expect(getCarryForwardSource([record({ fieldId: 'field-b' })], 'field-b', 2026, options)).toBeNull();
  });

  it('compares date-only values as local calendar dates', () => {
    const source = record({ date: '2026-09-19T23:30:00Z' });
    expect(getCarryForwardSource([source], 'field-b', 2026, options)).toBe(source);
  });
});

describe('formatCarryForwardTime', () => {
  it('formats an explicit local spray time without UTC conversion', () => {
    expect(formatCarryForwardTime(0, '08:42')).toBe('8:42 AM');
    expect(formatCarryForwardTime(0, '14:05')).toBe('2:05 PM');
  });
});
