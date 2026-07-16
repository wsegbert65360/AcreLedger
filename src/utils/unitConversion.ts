/**
 * Utility for agricultural spray unit conversions.
 * Handles fl oz, qt, gal (liquid) and oz, lb (dry).
 */

export type SprayUnit = 'fl oz/ac' | 'pt/ac' | 'qt/ac' | 'gal/ac' | 'oz/ac' | 'lb/ac';
export type TotalUnit = 'fl oz' | 'pt' | 'qt' | 'gal' | 'oz' | 'lb';

export const LIQUID_UNITS: SprayUnit[] = ['fl oz/ac', 'pt/ac', 'qt/ac', 'gal/ac'];
export const DRY_UNITS: SprayUnit[] = ['oz/ac', 'lb/ac'];

export interface SprayProductAmountFields {
  rate?: string | number;
  rateUnit?: string;
  totalProductAmount?: string;
  totalProductUnit?: string;
}

export function hasValidSprayRate(product: SprayProductAmountFields): boolean {
  const rate = typeof product.rate === 'number' ? product.rate : Number(product.rate);
  return Number.isFinite(rate) && rate > 0 && Boolean(product.rateUnit?.trim());
}

/**
 * Calculates total amount applied and returns value and most appropriate unit.
 */
export function calculateTotalAmount(rate: number, acres: number, unit: string): { value: number; unit: string } {
  if (isNaN(rate) || isNaN(acres) || rate <= 0 || acres <= 0) {
    return { value: 0, unit: unit.replace('/ac', '') || 'gal' };
  }

  const rawTotal = rate * acres;

  // Liquid Conversions
  if (unit === 'fl oz/ac') {
    if (rawTotal >= 128) return { value: Number((rawTotal / 128).toFixed(2)), unit: 'gal' };
    if (rawTotal >= 32) return { value: Number((rawTotal / 32).toFixed(2)), unit: 'qt' };
    if (rawTotal >= 16) return { value: Number((rawTotal / 16).toFixed(2)), unit: 'pt' };
    return { value: Number(rawTotal.toFixed(1)), unit: 'fl oz' };
  }

  if (unit === 'pt/ac') {
    if (rawTotal >= 8) return { value: Number((rawTotal / 8).toFixed(2)), unit: 'gal' };
    if (rawTotal >= 2) return { value: Number((rawTotal / 2).toFixed(2)), unit: 'qt' };
    return { value: Number(rawTotal.toFixed(1)), unit: 'pt' };
  }

  if (unit === 'qt/ac') {
    if (rawTotal >= 4) return { value: Number((rawTotal / 4).toFixed(2)), unit: 'gal' };
    return { value: Number(rawTotal.toFixed(1)), unit: 'qt' };
  }

  if (unit === 'gal/ac') {
    return { value: Number(rawTotal.toFixed(2)), unit: 'gal' };
  }

  // Dry Conversions
  if (unit === 'oz/ac' || unit === 'oz (dry)/ac') {
    if (rawTotal >= 16) return { value: Number((rawTotal / 16).toFixed(2)), unit: 'lb' };
    return { value: Number(rawTotal.toFixed(1)), unit: 'oz' };
  }

  if (unit === 'lb/ac') {
    return { value: Number(rawTotal.toFixed(2)), unit: 'lb' };
  }

  return { value: Number(rawTotal.toFixed(2)), unit: unit.replace('/ac', '') || 'gal' };
}

/**
 * Returns a copy with a canonical calculated total whenever rate and acreage
 * are usable. Invalid legacy rows are returned unchanged so opening the form
 * cannot erase a manually stored total.
 */
export function calculateSprayProductFields<T extends SprayProductAmountFields>(
  product: T,
  acres: number,
): T {
  if (!hasValidSprayRate(product) || !Number.isFinite(acres) || acres <= 0) return product;

  const rate = typeof product.rate === 'number' ? product.rate : Number(product.rate);
  const { value, unit } = calculateTotalAmount(rate, acres, product.rateUnit || '');
  return {
    ...product,
    totalProductAmount: value.toString(),
    totalProductUnit: unit,
  };
}

/**
 * Formats a total amount calculation into a display string.
 */
export function formatTotalAmount(rate: string | number, acres: number, rateUnit: string): string {
  const r = typeof rate === 'string' ? parseFloat(rate) : rate;
  if (isNaN(r) || isNaN(acres) || r <= 0 || acres <= 0) return '—';
  
  const { value, unit } = calculateTotalAmount(r, acres, rateUnit);
  return `${value} ${unit}`;
}

/**
 * Formats a spray product total from its rate and the record's authoritative
 * treated acreage without mutating the stored product data. Stored totals are
 * retained only as a fallback for legacy rows that cannot be recalculated.
 */
export function formatSprayProductTotal(
  product: {
    rate?: string | number;
    rateUnit?: string;
    totalProductAmount?: string;
    totalProductUnit?: string;
  },
  treatedAcres?: number | null,
): string {
  const rate = typeof product.rate === 'number' ? product.rate : parseFloat(product.rate || '');

  if (Number.isFinite(rate) && rate > 0 && treatedAcres != null && Number.isFinite(treatedAcres) && treatedAcres > 0) {
    return formatTotalAmount(rate, treatedAcres, product.rateUnit || '');
  }

  if (product.totalProductAmount) {
    return `${product.totalProductAmount} ${product.totalProductUnit || ''}`.trim();
  }

  return '—';
}

/**
 * Normalizes unit string for display in the UI.
 */
export function getUnitLabel(unit: string): string {
  switch (unit) {
    case 'fl oz/ac': return 'fl oz/ac (Liq)';
    case 'pt/ac': return 'pt/ac';
    case 'oz/ac':
    case 'oz (dry)/ac': return 'oz/ac (Dry)';
    default: return unit;
  }
}
