import { describe, it, expect } from 'vitest';
import { calculateTotalAmount, getUnitLabel, LIQUID_UNITS, DRY_UNITS } from './unitConversion';

describe('calculateTotalAmount', () => {
  // ─── Guard clauses ────────────────────────────────────────────────────────

  describe('guard clauses', () => {
    it('returns zero for NaN rate', () => {
      const result = calculateTotalAmount(NaN, 80, 'oz/ac');
      expect(result.value).toBe(0);
      expect(result.unit).toBe('oz');
    });

    it('returns zero for NaN acres', () => {
      const result = calculateTotalAmount(2, NaN, 'oz/ac');
      expect(result.value).toBe(0);
      expect(result.unit).toBe('oz');
    });

    it('returns zero for zero rate', () => {
      const result = calculateTotalAmount(0, 80, 'oz/ac');
      expect(result.value).toBe(0);
    });

    it('returns zero for zero acres', () => {
      const result = calculateTotalAmount(2, 0, 'oz/ac');
      expect(result.value).toBe(0);
    });

    it('returns zero for negative rate', () => {
      const result = calculateTotalAmount(-1, 80, 'oz/ac');
      expect(result.value).toBe(0);
    });
  });

  // ─── Liquid: fl oz/ac ──────────────────────────────────────────────────────
  // 128 fl oz = 1 gal, 32 fl oz = 1 qt, 16 fl oz = 1 pt

  describe('fl oz/ac', () => {
    it('stays in fl oz for small amounts (< 16 fl oz total)', () => {
      const result = calculateTotalAmount(1, 5, 'fl oz/ac'); // 5 fl oz total
      expect(result.value).toBe(5);
      expect(result.unit).toBe('fl oz');
    });

    it('converts to pt at >= 16 fl oz total', () => {
      const result = calculateTotalAmount(4, 5, 'fl oz/ac'); // 20 fl oz total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('pt');
    });

    it('converts to qt at >= 32 fl oz total', () => {
      const result = calculateTotalAmount(8, 5, 'fl oz/ac'); // 40 fl oz total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('qt');
    });

    it('converts to gal at >= 128 fl oz total', () => {
      const result = calculateTotalAmount(32, 5, 'fl oz/ac'); // 160 fl oz total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('gal');
    });

    it('converts to gal for large acreage', () => {
      const result = calculateTotalAmount(22, 80, 'fl oz/ac'); // 1760 fl oz total
      expect(result.value).toBe(13.75);
      expect(result.unit).toBe('gal');
    });
  });

  // ─── Liquid: pt/ac ─────────────────────────────────────────────────────────
  // 8 pt = 1 gal, 2 pt = 1 qt

  describe('pt/ac', () => {
    it('stays in pt for small amounts (< 2 pt total)', () => {
      const result = calculateTotalAmount(1, 1, 'pt/ac'); // 1 pt total
      expect(result.value).toBe(1);
      expect(result.unit).toBe('pt');
    });

    it('converts to qt at >= 2 pt total', () => {
      const result = calculateTotalAmount(1, 3, 'pt/ac'); // 3 pt total
      expect(result.value).toBe(1.5);
      expect(result.unit).toBe('qt');
    });

    it('converts to gal at >= 8 pt total', () => {
      const result = calculateTotalAmount(2, 5, 'pt/ac'); // 10 pt total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('gal');
    });
  });

  // ─── Liquid: qt/ac ─────────────────────────────────────────────────────────

  describe('qt/ac', () => {
    it('stays in qt for < 4 qt total', () => {
      const result = calculateTotalAmount(1, 2, 'qt/ac'); // 2 qt total
      expect(result.value).toBe(2);
      expect(result.unit).toBe('qt');
    });

    it('converts to gal at >= 4 qt total', () => {
      const result = calculateTotalAmount(1, 5, 'qt/ac'); // 5 qt total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('gal');
    });
  });

  // ─── Liquid: gal/ac ─────────────────────────────────────────────────────────

  describe('gal/ac', () => {
    it('always stays in gal', () => {
      const result = calculateTotalAmount(10, 100, 'gal/ac'); // 1000 gal
      expect(result.value).toBe(1000);
      expect(result.unit).toBe('gal');
    });

    it('handles fractional values', () => {
      const result = calculateTotalAmount(0.5, 80, 'gal/ac');
      expect(result.value).toBe(40);
      expect(result.unit).toBe('gal');
    });
  });

  // ─── Dry: oz/ac ────────────────────────────────────────────────────────────
  // 16 oz = 1 lb

  describe('oz/ac', () => {
    it('stays in oz for < 16 oz total', () => {
      const result = calculateTotalAmount(2, 5, 'oz/ac'); // 10 oz total
      expect(result.value).toBe(10);
      expect(result.unit).toBe('oz');
    });

    it('converts to lb at >= 16 oz total', () => {
      const result = calculateTotalAmount(4, 5, 'oz/ac'); // 20 oz total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('lb');
    });
  });

  // ─── Dry: lb/ac ────────────────────────────────────────────────────────────

  describe('lb/ac', () => {
    it('always stays in lb', () => {
      const result = calculateTotalAmount(2, 50, 'lb/ac'); // 100 lb total
      expect(result.value).toBe(100);
      expect(result.unit).toBe('lb');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles oz (dry)/ac variant unit string', () => {
      const result = calculateTotalAmount(4, 5, 'oz (dry)/ac'); // 20 oz total
      expect(result.value).toBe(1.25);
      expect(result.unit).toBe('lb');
    });

    it('returns fallback unit for unknown unit strings', () => {
      const result = calculateTotalAmount(5, 10, 'kg/ac');
      expect(result.value).toBe(50);
      expect(result.unit).toBe('kg');
    });
  });
});

describe('getUnitLabel', () => {
  it('returns formatted label for fl oz/ac', () => {
    expect(getUnitLabel('fl oz/ac')).toBe('fl oz/ac (Liq)');
  });

  it('returns label for oz/ac', () => {
    expect(getUnitLabel('oz/ac')).toBe('oz/ac (Dry)');
  });

  it('returns label for oz (dry)/ac', () => {
    expect(getUnitLabel('oz (dry)/ac')).toBe('oz/ac (Dry)');
  });

  it('returns raw string for unknown units', () => {
    expect(getUnitLabel('kg/ac')).toBe('kg/ac');
  });
});
