import { describe, expect, it } from 'vitest';

import { getLatestForField } from './utils';

type PlantLike = {
  id: string;
  fieldId: string;
  deleted_at: string | null;
  plantDate?: string;
  timestamp: number;
};

const row = (overrides: Partial<PlantLike> & Pick<PlantLike, 'id'>): PlantLike => ({
  fieldId: 'f1',
  deleted_at: null,
  timestamp: 0,
  ...overrides,
});

describe('getLatestForField', () => {
  it('prefers the later work date over a later save timestamp', () => {
    const dated = row({
      id: 'newer-work',
      plantDate: '2026-06-11',
      timestamp: new Date(2026, 5, 10, 20, 0).getTime(),
    });
    const timestampOnly = row({
      id: 'later-save',
      timestamp: new Date(2026, 5, 10, 21, 0).getTime(),
    });

    const latest = getLatestForField([timestampOnly, dated], 'f1', 'plantDate');
    expect(latest?.id).toBe('newer-work');
  });

  it('returns the newest date-only row when every record has a work date', () => {
    const april = row({ id: 'april', plantDate: '2026-04-22', timestamp: 9_000 });
    const june = row({ id: 'june', plantDate: '2026-06-19', timestamp: 1_000 });

    expect(getLatestForField([april, june], 'f1', 'plantDate')?.id).toBe('june');
  });

  it('ignores other fields and soft-deleted rows', () => {
    const keep = row({ id: 'keep', plantDate: '2026-05-01', timestamp: 1 });
    const otherField = row({ id: 'other', fieldId: 'f2', plantDate: '2026-06-01', timestamp: 2 });
    const deleted = row({
      id: 'gone',
      plantDate: '2026-07-01',
      timestamp: 3,
      deleted_at: '2026-07-02T00:00:00.000Z',
    });

    expect(getLatestForField([deleted, otherField, keep], 'f1', 'plantDate')?.id).toBe('keep');
  });
});
