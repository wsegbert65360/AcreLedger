import { describe, expect, it } from 'vitest';

import { formatSprayProductTotal } from './unitConversion';

describe('formatSprayProductTotal', () => {
  it.each([
    ['fl oz/ac', '16', 10, '1.25 gal'],
    ['pt/ac', '1', 10, '1.25 gal'],
    ['qt/ac', '1', 10, '2.5 gal'],
    ['gal/ac', '1', 10, '10 gal'],
    ['oz/ac', '2', 10, '1.25 lb'],
    ['oz (dry)/ac', '2', 10, '1.25 lb'],
    ['lb/ac', '2', 10, '20 lb'],
  ])('recalculates %s chemical totals', (rateUnit, rate, acres, expected) => {
    expect(formatSprayProductTotal({ rate, rateUnit }, acres)).toBe(expected);
  });

  it('calculates the displayed total from authoritative treated acreage', () => {
    expect(formatSprayProductTotal({
      rate: '1',
      rateUnit: 'qt/ac',
      totalProductAmount: '25',
      totalProductUnit: 'gal',
    }, 80)).toBe('20 gal');
  });

  it('falls back to the stored total when the legacy row cannot be recalculated', () => {
    expect(formatSprayProductTotal({
      rate: '',
      rateUnit: 'qt/ac',
      totalProductAmount: '25',
      totalProductUnit: 'gal',
    }, 80)).toBe('25 gal');
  });

  it('does not mutate the stored product', () => {
    const product = {
      rate: '32',
      rateUnit: 'fl oz/ac',
      totalProductAmount: '20',
      totalProductUnit: 'gal',
    };
    const original = structuredClone(product);

    expect(formatSprayProductTotal(product, 60)).toBe('15 gal');
    expect(product).toEqual(original);
  });
});
