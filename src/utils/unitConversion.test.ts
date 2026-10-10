import { describe, expect, it } from 'vitest';

import {
  acresToHectares,
  calculateSprayProductFields,
  calculateTotalAmount,
  formatSprayProductTotal,
  getUnitLabel,
  hasValidSprayRate,
  hectaresToAcres,
} from './unitConversion';

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

describe('metric spray ladders (AU pilot)', () => {
  it.each([
    ['mL/ha', '500', 10, '5 L'],
    ['mL/ha', '100', 10, '1 L'],
    ['mL/ha', '50', 10, '500 mL'],
    ['L/ha', '2', 10, '20 L'],
    ['g/ha', '500', 10, '5 kg'],
    ['g/ha', '50', 10, '500 g'],
    ['kg/ha', '2', 10, '20 kg'],
  ])('recalculates %s chemical totals in metric', (rateUnit, rate, hectares, expected) => {
    expect(formatSprayProductTotal({ rate, rateUnit }, hectares)).toBe(expected);
  });

  it('returns a zero total with the metric unit for invalid input', () => {
    expect(calculateTotalAmount(0, 10, 'L/ha')).toEqual({ value: 0, unit: 'L' });
    expect(calculateTotalAmount(2, 0, 'kg/ha')).toEqual({ value: 0, unit: 'kg' });
  });

  it('converts acres to hectares and back without material loss', () => {
    expect(acresToHectares(100)).toBe(40.4686);
    expect(hectaresToAcres(40.4686)).toBeCloseTo(100, 3);
    expect(hectaresToAcres(acresToHectares(37.5))).toBeCloseTo(37.5, 3);
  });

  it('labels metric units', () => {
    expect(getUnitLabel('L/ha')).toBe('L/ha');
    expect(getUnitLabel('mL/ha')).toBe('mL/ha');
    expect(getUnitLabel('kg/ha')).toBe('kg/ha');
    expect(getUnitLabel('g/ha')).toBe('g/ha');
  });

  it('keeps imperial ladders unchanged', () => {
    expect(formatSprayProductTotal({ rate: '16', rateUnit: 'fl oz/ac' }, 10)).toBe('1.25 gal');
    expect(formatSprayProductTotal({ rate: '2', rateUnit: 'lb/ac' }, 10)).toBe('20 lb');
  });
});
