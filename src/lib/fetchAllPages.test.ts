import { describe, expect, it } from 'vitest';

import { COMPLETE_COLLECTION_PAGE_SIZE, fetchAllPages } from './fetchAllPages';

const row = (n: number) => ({ id: `row-${n}` });

/** Serves deterministic pages from a fixed row universe, recording ranges. */
function makeFixedSource(total: number) {
  const ranges: Array<[number, number]> = [];
  const all = Array.from({ length: total }, (_, i) => row(i));
  return {
    ranges,
    makePage: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    },
  };
}

describe('fetchAllPages', () => {
  it('aggregates successive offset pages until a short page ends the read', async () => {
    const { makePage, ranges } = makeFixedSource(2500);

    const { rows, error } = await fetchAllPages(makePage);

    expect(error).toBeNull();
    expect(rows).toHaveLength(2500);
    expect(rows[0]).toEqual(row(0));
    expect(rows[2499]).toEqual(row(2499));
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('requests exactly one page for a collection smaller than the page size', async () => {
    const { makePage, ranges } = makeFixedSource(3);

    const { rows, error } = await fetchAllPages(makePage);

    expect(error).toBeNull();
    expect(rows).toHaveLength(3);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('requests one follow-up page when the collection exactly fills whole pages', async () => {
    const { makePage, ranges } = makeFixedSource(2000);

    const { rows, error } = await fetchAllPages(makePage);

    expect(error).toBeNull();
    expect(rows).toHaveLength(2000);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('returns an empty collection with no error after one empty page', async () => {
    const { makePage, ranges } = makeFixedSource(0);

    const { rows, error } = await fetchAllPages(makePage);

    expect(error).toBeNull();
    expect(rows).toEqual([]);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('aborts with no rows when a later page errors so partial data is never mistaken for complete', async () => {
    const { makePage } = makeFixedSource(2500);
    let calls = 0;
    const failingSecondPage = async (from: number, to: number) => {
      calls += 1;
      if (calls === 2) return { data: null, error: { message: 'page 2 failed' } };
      return makePage(from, to);
    };

    const { rows, error } = await fetchAllPages(failingSecondPage);

    expect(error).toEqual({ message: 'page 2 failed' });
    expect(rows).toEqual([]);
    expect(calls).toBe(2);
  });

  it('treats a null data payload as an empty page', async () => {
    const { rows, error } = await fetchAllPages(async () => ({ data: null, error: null }));

    expect(error).toBeNull();
    expect(rows).toEqual([]);
  });

  it('honors a custom page size', async () => {
    const { makePage, ranges } = makeFixedSource(5);

    const { rows, error } = await fetchAllPages(makePage, 2);

    expect(error).toBeNull();
    expect(rows).toHaveLength(5);
    expect(ranges).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('exports the Data API max_rows cap as the default page size', () => {
    expect(COMPLETE_COLLECTION_PAGE_SIZE).toBe(1000);
  });
});
