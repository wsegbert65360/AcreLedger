/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPreSeasonSnapshot,
  isTerminalPreSeasonUndoError,
  preSeasonSnapshotKey,
  readPreSeasonSnapshot,
  writePreSeasonSnapshot,
} from './preSeasonSnapshot';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('pre-season snapshot pointer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the id for one user and farm only', () => {
    writePreSeasonSnapshot('user-1', 'farm-1', { id, fromSeason: 2025, toSeason: 2026 });
    expect(localStorage.getItem(preSeasonSnapshotKey('user-1', 'farm-1'))).toContain(id);
    expect(readPreSeasonSnapshot('user-1', 'farm-1')).toEqual({
      id, fromSeason: 2025, toSeason: 2026,
    });
    expect(readPreSeasonSnapshot('user-2', 'farm-1')).toBeNull();
    expect(readPreSeasonSnapshot('user-1', 'farm-2')).toBeNull();
    expect(readPreSeasonSnapshot(null, 'farm-1')).toBeNull();
  });

  it('ignores a pointer that is not one forward season', () => {
    localStorage.setItem(preSeasonSnapshotKey('user-1', 'farm-1'), JSON.stringify({
      id, fromSeason: 2025, toSeason: 2027,
    }));
    expect(readPreSeasonSnapshot('user-1', 'farm-1')).toBeNull();
    localStorage.setItem(preSeasonSnapshotKey('user-1', 'farm-1'), 'not-json');
    expect(readPreSeasonSnapshot('user-1', 'farm-1')).toBeNull();
  });

  it('clears only that farm pointer and recognizes a finished undo', () => {
    writePreSeasonSnapshot('user-1', 'farm-1', { id, fromSeason: 2025, toSeason: 2026 });
    writePreSeasonSnapshot('user-1', 'farm-2', { id, fromSeason: 2024, toSeason: 2025 });
    clearPreSeasonSnapshot('user-1', 'farm-1');
    expect(readPreSeasonSnapshot('user-1', 'farm-1')).toBeNull();
    expect(readPreSeasonSnapshot('user-1', 'farm-2')?.fromSeason).toBe(2024);
    expect(isTerminalPreSeasonUndoError('This pre-season reset was already undone.')).toBe(true);
    expect(isTerminalPreSeasonUndoError('This pre-season reset is older than 30 days and cannot be undone.')).toBe(true);
    expect(isTerminalPreSeasonUndoError('Only the latest pre-season reset can be undone.')).toBe(true);
    expect(isTerminalPreSeasonUndoError('Pre-season reset snapshot not found.')).toBe(true);
    expect(isTerminalPreSeasonUndoError('network down')).toBe(false);
  });
});
