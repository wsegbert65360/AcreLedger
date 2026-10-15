import { describe, expect, it } from 'vitest';

import { collectPagedFieldIds, FIELD_PAGE_SIZE } from '../../supabase/functions/shared/mrmsFieldPage';
import { gridCell, inchesFromPacked, type GridSpec } from '../../supabase/functions/shared/mrmsGrid';

const GRID: GridSpec = {
  latStart: 10,
  lonStart: -10,
  latStep: -1,
  lonStep: 1,
  rows: 3,
  cols: 3,
};

describe('MRMS rainfall samples', () => {
  it('returns null for out-of-grid coordinates', () => {
    expect(gridCell({ lat: 10, lng: -10 }, GRID)).toEqual({ row: 0, col: 0 });
    expect(gridCell({ lat: 0, lng: 0 }, GRID)).toBeNull();
    expect(gridCell({ lat: 10, lng: -6 }, GRID)).toBeNull();
  });

  it('returns null for sentinel and negative samples and keeps a real zero', () => {
    expect(inchesFromPacked(0xffff, 0, 0, 0, 16)).toBeNull();
    expect(inchesFromPacked(0xff, 0, 0, 0, 8)).toBeNull();
    expect(inchesFromPacked(0, -5, 0, 0, 16)).toBeNull();
    expect(inchesFromPacked(Number.NaN, 0, 0, 0, 16)).toBeNull();
    expect(inchesFromPacked(0, 0, 0, 0, 16)).toBe(0);
    expect(inchesFromPacked(1, 0, 0, 0, 16)).toBeCloseTo(0.0393701);
  });
});

describe('finalized field id pagination', () => {
  it('keeps requesting pages of FIELD_PAGE_SIZE instead of stopping at 1,000 rows', async () => {
    const ranges: Array<[number, number]> = [];
    const ids = await collectPagedFieldIds(async (from, to) => {
      ranges.push([from, to]);
      if (from === 0) {
        return {
          data: Array.from({ length: FIELD_PAGE_SIZE }, (_, index) => ({ field_id: `f${index}` })),
          error: null,
        };
      }
      if (from === FIELD_PAGE_SIZE) {
        return { data: [{ field_id: 'tail' }], error: null };
      }
      return { data: [], error: null };
    });

    expect(ranges).toEqual([
      [0, FIELD_PAGE_SIZE - 1],
      [FIELD_PAGE_SIZE, FIELD_PAGE_SIZE * 2 - 1],
    ]);
    expect(ids.size).toBe(FIELD_PAGE_SIZE + 1);
    expect(ids.has('f0')).toBe(true);
    expect(ids.has('tail')).toBe(true);
  });

  it('throws when a page fails instead of treating the first page as complete', async () => {
    await expect(collectPagedFieldIds(async () => ({
      data: null,
      error: { message: 'statement timeout' },
    }))).rejects.toEqual({ message: 'statement timeout' });
  });
});
