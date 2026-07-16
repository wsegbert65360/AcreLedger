import { describe, expect, it } from 'vitest';

import { calculateSprayProductFields, formatSprayProductTotal, hasValidSprayRate } from './unitConversion';

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

describe('spray product persistence helpers', () => {
  it('calculates canonical stored fields without mutating the input', () => {
    const product = { rate: '16', rateUnit: 'fl oz/ac', totalProductAmount: '', totalProductUnit: 'gal' };
    const calculated = calculateSprayProductFields(product, 10);

    expect(calculated).toEqual(expect.objectContaining({ totalProductAmount: '1.25', totalProductUnit: 'gal' }));
    expect(product.totalProductAmount).toBe('');
  });

  it('requires a positive rate and a unit', () => {
    expect(hasValidSprayRate({ rate: '', rateUnit: 'qt/ac' })).toBe(false);
    expect(hasValidSprayRate({ rate: '0', rateUnit: 'qt/ac' })).toBe(false);
    expect(hasValidSprayRate({ rate: '1', rateUnit: '' })).toBe(false);
    expect(hasValidSprayRate({ rate: '1', rateUnit: 'qt/ac' })).toBe(true);
  });

  it('preserves a legacy stored total when rate data is invalid', () => {
    const product = { rate: '', rateUnit: 'qt/ac', totalProductAmount: '25', totalProductUnit: 'gal' };
    expect(calculateSprayProductFields(product, 80)).toBe(product);
  });
});
