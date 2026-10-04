/**
 * Utility for agricultural spray unit conversions.
 * Handles fl oz, qt, gal (liquid) and oz, lb (dry), plus metric
 * L/ha, mL/ha (liquid) and kg/ha, g/ha (dry) for the Australia pilot.
 */

export type SprayUnit = 'fl oz/ac' | 'pt/ac' | 'qt/ac' | 'gal/ac' | 'oz/ac' | 'lb/ac';
export type MetricSprayUnit = 'L/ha' | 'mL/ha' | 'kg/ha' | 'g/ha';
export type TotalUnit = 'fl oz' | 'pt' | 'qt' | 'gal' | 'oz' | 'lb';
export type MetricTotalUnit = 'L' | 'mL' | 'kg' | 'g';

export const LIQUID_UNITS: SprayUnit[] = ['fl oz/ac', 'pt/ac', 'qt/ac', 'gal/ac'];
export const DRY_UNITS: SprayUnit[] = ['oz/ac', 'lb/ac'];
export const METRIC_LIQUID_UNITS: MetricSprayUnit[] = ['L/ha', 'mL/ha'];
export const METRIC_DRY_UNITS: MetricSprayUnit[] = ['kg/ha', 'g/ha'];

/**
 * Area conversion constants. 1 acre = 0.404686 ha exactly enough for
 * farm-record purposes; values are rounded to 4 decimals on conversion.
 */
export const HECTARES_PER_ACRE = 0.404686;
export const ACRES_PER_HECTARE = 2.47105;

export function acresToHectares(acres: number): number {
  return Number((acres * HECTARES_PER_ACRE).toFixed(4));
}

export function hectaresToAcres(hectares: number): number {
  return Number((hectares * ACRES_PER_HECTARE).toFixed(4));
}

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
 * `area` is in acres for imperial (/ac) rate units and in hectares for
 * metric (/ha) rate units — the rate unit determines the area unit.
 */
export function calculateTotalAmount(rate: number, area: number, unit: string): { value: number; unit: string } {
  if (isNaN(rate) || isNaN(area) || rate <= 0 || area <= 0) {
    return { value: 0, unit: unit.replace('/ac', '').replace('/ha', '') || 'gal' };
  }

  const rawTotal = rate * area;

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

  // Metric Liquid Conversions (area in hectares)
  if (unit === 'mL/ha') {
    if (rawTotal >= 1000) return { value: Number((rawTotal / 1000).toFixed(2)), unit: 'L' };
    return { value: Number(rawTotal.toFixed(1)), unit: 'mL' };
  }

  if (unit === 'L/ha') {
    return { value: Number(rawTotal.toFixed(2)), unit: 'L' };
  }

  // Metric Dry Conversions (area in hectares)
  if (unit === 'g/ha') {
    if (rawTotal >= 1000) return { value: Number((rawTotal / 1000).toFixed(2)), unit: 'kg' };
    return { value: Number(rawTotal.toFixed(1)), unit: 'g' };
  }

  if (unit === 'kg/ha') {
    return { value: Number(rawTotal.toFixed(2)), unit: 'kg' };
  }

  return { value: Number(rawTotal.toFixed(2)), unit: unit.replace('/ac', '').replace('/ha', '') || 'gal' };
}

/**
 * Returns a copy with a canonical calculated total whenever rate and acreage
 * are usable. Invalid legacy rows are returned unchanged so opening the form
 * cannot erase a manually stored total.
 */
export function calculateSprayProductFields<T extends SprayProductAmountFields>(
  product: T,
  area: number,
): T {
  if (!hasValidSprayRate(product) || !Number.isFinite(area) || area <= 0) return product;

  const rate = typeof product.rate === 'number' ? product.rate : Number(product.rate);
  const { value, unit } = calculateTotalAmount(rate, area, product.rateUnit || '');
  return {
    ...product,
    totalProductAmount: value.toString(),
    totalProductUnit: unit,
  };
}

/**
 * Formats a total amount calculation into a display string.
 * `area` is in acres for imperial (/ac) rate units, hectares for metric (/ha).
 */
export function formatTotalAmount(rate: string | number, area: number, rateUnit: string): string {
  const r = typeof rate === 'string' ? parseFloat(rate) : rate;
  if (isNaN(r) || isNaN(area) || r <= 0 || area <= 0) return '—';
  
  const { value, unit } = calculateTotalAmount(r, area, rateUnit);
  return `${value} ${unit}`;
}

/**
 * Formats a spray product total from its rate and the record's authoritative
 * treated area without mutating the stored product data. Stored totals are
 * retained only as a fallback for legacy rows that cannot be recalculated.
 * `treatedArea` is in acres for imperial (/ac) rate units, hectares for metric.
 */
export function formatSprayProductTotal(
  product: {
    rate?: string | number;
    rateUnit?: string;
    totalProductAmount?: string;
    totalProductUnit?: string;
  },
  treatedArea?: number | null,
): string {
  const rate = typeof product.rate === 'number' ? product.rate : parseFloat(product.rate || '');

  if (Number.isFinite(rate) && rate > 0 && treatedArea != null && Number.isFinite(treatedArea) && treatedArea > 0) {
    return formatTotalAmount(rate, treatedArea, product.rateUnit || '');
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
    case 'mL/ha': return 'mL/ha';
    case 'L/ha': return 'L/ha';
    case 'g/ha': return 'g/ha';
    case 'kg/ha': return 'kg/ha';
    default: return unit;
  }
}
