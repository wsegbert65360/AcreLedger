import { describe, expect, it } from 'vitest';

import {
  canRestoreFarmBackup,
  isPreSeasonResetBackup,
  preSeasonRollbackTables,
  readFarmRole,
} from './backupRestorePolicy';

describe('backup restore policy', () => {
  it('allows the farm owner and an admin, and refuses a worker', () => {
    expect(canRestoreFarmBackup('owner')).toBe(true);
    expect(canRestoreFarmBackup('admin')).toBe(true);
    expect(canRestoreFarmBackup('worker')).toBe(false);
    expect(canRestoreFarmBackup('guest')).toBe(false);
    expect(canRestoreFarmBackup(null)).toBe(true);
    expect(canRestoreFarmBackup(undefined)).toBe(true);
  });

  it('reads only the three farm roles', () => {
    expect(readFarmRole('worker')).toBe('worker');
    expect(readFarmRole('Owner')).toBeNull();
    expect(readFarmRole(null)).toBeNull();
  });

  it('recognizes a pre-season reset by file name or rollover date', () => {
    expect(isPreSeasonResetBackup('Pre_Season_Reset_2026-10-01.json', {})).toBe(true);
    expect(isPreSeasonResetBackup('acreledger-backup.json', { rolloverDate: '2026-10-01T00:00:00.000Z' })).toBe(true);
    expect(isPreSeasonResetBackup('acreledger-backup.json', {})).toBe(false);
    expect(isPreSeasonResetBackup('notes.txt', { rolloverDate: '   ' })).toBe(false);
  });

  it('lists only collection arrays that the file actually contains', () => {
    expect(preSeasonRollbackTables({
      fields: [],
      sprayRecords: [{ id: 's1' }],
      rolloverDate: '2026-10-01T00:00:00.000Z',
      equipment: 'not-an-array',
    })).toEqual(['fields', 'spray_records']);
    expect(preSeasonRollbackTables(null)).toEqual([]);
  });
});
