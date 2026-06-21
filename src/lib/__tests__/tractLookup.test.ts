import { describe, expect, it } from 'vitest';

import { parseTractKeys } from '@/lib/tractLookup';

describe('parseTractKeys', () => {
  it('joins separate farm and tract identifiers', () => {
    expect(parseTractKeys('6418', '1417')).toEqual(['6418-1417']);
  });

  it('preserves combined identifiers when no tract value is supplied', () => {
    expect(parseTractKeys('6418-1417/7653-12050', undefined)).toEqual([
      '6418-1417',
      '7653-12050',
    ]);
  });

  it('normalizes a combined farm identifier when the tract is also supplied', () => {
    expect(parseTractKeys('6418-1417', '1417')).toEqual(['6418-1417']);
  });

  it('returns no key for a farm identifier without a tract', () => {
    expect(parseTractKeys('6418', undefined)).toEqual([]);
  });

  it('reuses one farm number across multiple tracts', () => {
    expect(parseTractKeys('6418', '1417/1418')).toEqual([
      '6418-1417',
      '6418-1418',
    ]);
  });

  it('deduplicates repeated farm or tract identifiers', () => {
    expect(parseTractKeys('6418/6418', '1417')).toEqual(['6418-1417']);
    expect(parseTractKeys('6418', '1417/1417')).toEqual(['6418-1417']);
    expect(parseTractKeys('6418/6418-1417', undefined)).toEqual(['6418-1417']);
  });
});
