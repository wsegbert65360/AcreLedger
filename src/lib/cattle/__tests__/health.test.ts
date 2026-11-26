import { describe, expect, it } from 'vitest';

import type { CattleTreatment } from '@/types/cattle';
import {
  activeWithdrawal, addDaysIso, describeDose, isWithdrawalActive, productMemory, treatmentWithdrawalUntil,
  withdrawalConflicts,
} from '../health';
import { buildTreatmentRecordRows, treatmentYears } from '../treatmentRecordPdf';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };

function treatment(over: Partial<CattleTreatment> = {}): CattleTreatment {
  return {
    ...base, id: 't1', groupId: 'g1', treatedOn: '2026-05-01', product: 'Ivomec', kind: 'dewormer',
    headTreated: 20, dose: 10, doseUnit: 'mL', doseBasis: 'per_100_lb', route: 'pour_on',
    withdrawalDays: 48, withdrawalUntil: '2026-06-18', ...over,
  };
}

describe('withdrawal dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDaysIso('2026-12-20', 15)).toBe('2027-01-04');
    expect(treatmentWithdrawalUntil('2026-05-01', 48)).toBe('2026-06-18');
    expect(treatmentWithdrawalUntil('2026-05-01', 0)).toBe('2026-05-01');
  });

  it('holds cattle until the withdrawal date passes', () => {
    const item = treatment();
    expect(isWithdrawalActive(item, '2026-06-17')).toBe(true);
    expect(isWithdrawalActive(item, '2026-06-18')).toBe(false);
    expect(isWithdrawalActive({ ...item, deleted_at: '2026-05-02T00:00:00Z' }, '2026-05-03')).toBe(false);
  });

  it('picks the longest hold and lets a class-only treatment skip other classes', () => {
    const calves = treatment({ id: 't2', cattleClass: 'calves', withdrawalUntil: '2026-07-30', product: 'Draxxin' });
    const all = [treatment(), calves];
    expect(activeWithdrawal(all, 'g1', '2026-06-01')?.product).toBe('Draxxin');
    expect(activeWithdrawal(all, 'g1', '2026-06-01', 'steers')?.product).toBe('Ivomec');
    expect(activeWithdrawal(all, 'g2', '2026-06-01')).toBeNull();
    expect(withdrawalConflicts(all, 'g1', '2026-06-01', 'steers')).toHaveLength(1);
    expect(withdrawalConflicts(all, 'g1', '2026-08-01')).toHaveLength(0);
  });
});

describe('product memory and dose text', () => {
  it('remembers the latest withdrawal days typed for a product', () => {
    const memory = productMemory([
      treatment({ id: 'a', treatedOn: '2026-03-01', withdrawalDays: 35 }),
      treatment({ id: 'b', treatedOn: '2026-05-01', withdrawalDays: 48 }),
    ]);
    expect(memory).toHaveLength(1);
    expect(memory[0]).toMatchObject({ product: 'Ivomec', withdrawalDays: 48 });
  });

  it('describes the dose with its basis', () => {
    expect(describeDose(treatment())).toContain('10');
    expect(describeDose(treatment())).toContain('mL');
  });
});

describe('treatment record rows', () => {
  const groups = [{ id: 'g1', name: 'Cows', deleted_at: null }, { id: 'g2', name: 'Gone', deleted_at: '2026-01-02T00:00:00Z' }];

  it('lists the years that have treatments, newest first', () => {
    expect(treatmentYears([
      treatment({ treatedOn: '2025-04-01' }), treatment({ treatedOn: '2026-05-01' }),
      treatment({ treatedOn: '2024-01-01', deleted_at: '2024-01-02T00:00:00Z' }),
    ])).toEqual(['2026', '2025']);
  });

  it('builds the year oldest first and skips deleted herds and treatments', () => {
    const rows = buildTreatmentRecordRows([
      treatment({ id: 'late', treatedOn: '2026-09-01', product: 'Late', withdrawalDays: 0, withdrawalUntil: '2026-09-01' }),
      treatment({ id: 'early', treatedOn: '2026-02-01', product: 'Early' }),
      treatment({ id: 'old', treatedOn: '2025-02-01', product: 'LastYear' }),
      treatment({ id: 'orphan', groupId: 'g2', product: 'Orphan' }),
      treatment({ id: 'del', product: 'Deleted', deleted_at: '2026-05-02T00:00:00Z' }),
    ], groups, '2026');
    expect(rows.map(row => row.product)).toEqual(['Early', 'Late']);
    expect(rows[0].herd).toBe('Cows');
    expect(rows[1].withdrawalUntil).toBe('—');
  });
});
