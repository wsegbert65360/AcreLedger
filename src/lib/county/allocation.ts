import { roundTo } from '@/utils/numbers';
import type { CountyAssignment, CountyDisplayStatus, CountyShare } from './types';

export const ACRES_TOLERANCE = 0.005;
/** Mapped vs recorded acreage is flagged when it differs by more than both of these. */
export const ACREAGE_DIFF_MIN_ACRES = 0.5;
export const ACREAGE_DIFF_MIN_FRACTION = 0.05;
/** Mapped acres within this fraction of recorded acres count as the same measurement. */
export const ACREAGE_MATCH_FRACTION = 0.005;

/**
 * Splits `total` across `weights` so the rounded parts add up to the rounded total exactly
 * (largest-remainder method). Zero or negative weights receive nothing; if every weight is
 * zero the whole amount goes to the first slot so nothing is dropped.
 */
export function allocateByLargestRemainder(total: number, weights: number[], decimals = 2): number[] {
  if (weights.length === 0) return [];
  const scale = Math.pow(10, decimals);
  const totalUnits = Math.round((Number.isFinite(total) ? total : 0) * scale);
  const positive = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = positive.reduce((a, b) => a + b, 0);
  if (!(weightSum > 0)) {
    const result = weights.map(() => 0);
    result[0] = totalUnits / scale;
    return result;
  }
  const sign = totalUnits < 0 ? -1 : 1;
  const absUnits = Math.abs(totalUnits);
  const exact = positive.map(w => (w / weightSum) * absUnits);
  const floors = exact.map(Math.floor);
  let remaining = absUnits - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, rem: value - floors[index] }))
    .sort((a, b) => b.rem - a.rem || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    if (positive[index] <= 0) continue;
    floors[index] += 1;
    remaining -= 1;
  }
  return floors.map(units => (sign * units) / scale);
}

export interface AcreageComparison {
  mappedAcres: number;
  recordedAcres: number;
  differenceAcres: number;
  differenceFraction: number;
  /** Substantially different: needs a human look. */
  needsReview: boolean;
  /** Close enough that mapped acres can stand in for the recorded figure. */
  matches: boolean;
}

export function compareMappedToRecorded(mappedAcres: number, recordedAcres: number): AcreageComparison {
  const difference = mappedAcres - recordedAcres;
  const fraction = recordedAcres > 0 ? Math.abs(difference) / recordedAcres : (mappedAcres > 0 ? 1 : 0);
  return {
    mappedAcres: roundTo(mappedAcres, 2),
    recordedAcres: roundTo(recordedAcres, 2),
    differenceAcres: roundTo(difference, 2),
    differenceFraction: fraction,
    needsReview: Math.abs(difference) > ACREAGE_DIFF_MIN_ACRES && fraction > ACREAGE_DIFF_MIN_FRACTION,
    matches: fraction <= ACREAGE_MATCH_FRACTION || Math.abs(difference) <= ACRES_TOLERANCE,
  };
}

export function activeRows(rows: CountyAssignment[]): CountyAssignment[] {
  return rows.filter(row => !row.deletedAt);
}

export function totalMappedAcres(rows: CountyAssignment[]): number {
  return roundTo(activeRows(rows).reduce((sum, row) => sum + (row.mappedAcres ?? 0), 0), 4);
}

function rowFraction(row: CountyAssignment, rows: CountyAssignment[]): number {
  if (row.method === 'manual') {
    const total = rows.reduce((sum, r) => sum + (r.manualAcres ?? 0), 0);
    return total > 0 ? (row.manualAcres ?? 0) / total : 0;
  }
  if (row.proportion != null) return row.proportion;
  return rows.length === 1 ? 1 : 0;
}

/** County shares of one subject, from its active rows. An unresolved subject is one unknown share. */
export function sharesFromRows(rows: CountyAssignment[]): CountyShare[] {
  const active = activeRows(rows);
  if (active.length === 0 || active.every(r => r.countyFips == null)) {
    return [{ countyFips: null, countyName: null, stateAbbr: null, fraction: 1 }];
  }
  const resolved = active.filter(r => r.countyFips != null);
  return resolved.map(row => ({
    countyFips: row.countyFips,
    countyName: row.countyName,
    stateAbbr: row.stateAbbr,
    fraction: rowFraction(row, resolved),
  }));
}

export interface AllocatedPart<T> {
  share: T;
  amount: number;
}

/** Allocate a recorded quantity across shares; parts add up to the total exactly at `decimals`. */
export function allocateAcrossShares(total: number, shares: CountyShare[], decimals = 2): AllocatedPart<CountyShare>[] {
  const amounts = allocateByLargestRemainder(total, shares.map(s => s.fraction), decimals);
  return shares.map((share, i) => ({ share, amount: amounts[i] }));
}

export interface ManualSplitEntry {
  countyFips: string;
  acres: number;
}

export interface ManualSplitValidation {
  valid: boolean;
  errors: string[];
  totalAcres: number;
}

/** A manual split must name each county once, use positive acres, and add up to the recorded acreage. */
export function validateManualSplit(entries: ManualSplitEntry[], recordedAcres: number): ManualSplitValidation {
  const errors: string[] = [];
  if (entries.length === 0) errors.push('Choose at least one county');
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!/^\d{5}$/.test(entry.countyFips)) errors.push('Each county needs a five-digit FIPS code');
    if (seen.has(entry.countyFips)) errors.push(`County ${entry.countyFips} is listed twice`);
    seen.add(entry.countyFips);
    if (!Number.isFinite(entry.acres) || entry.acres <= 0) errors.push('Each county needs acres greater than zero');
  }
  const total = roundTo(entries.reduce((sum, e) => sum + (Number.isFinite(e.acres) ? e.acres : 0), 0), 2);
  if (!(recordedAcres > 0)) {
    errors.push('There is no recorded acreage to split');
  } else if (Math.abs(total - roundTo(recordedAcres, 2)) > ACRES_TOLERANCE) {
    errors.push(`Split adds up to ${total} ac but the recorded acreage is ${roundTo(recordedAcres, 2)} ac`);
  }
  return { valid: errors.length === 0, errors, totalAcres: total };
}

export interface CountyStatusResult {
  status: CountyDisplayStatus;
  reasons: string[];
  /** The county figures are allocated from recorded acreage, not measured county acres. */
  estimated: boolean;
}

/**
 * The one label the UI and reports show for a subject. Derived on read so it stays right when
 * recorded acreage changes after the county rows were saved.
 */
export function deriveCountyStatus(rows: CountyAssignment[], recordedAcres: number | null): CountyStatusResult {
  const active = activeRows(rows);
  const reasons: string[] = [];
  if (active.length === 0 || active.every(r => r.countyFips == null)) {
    const why = active.find(r => r.reviewReason)?.reviewReason;
    return { status: 'unresolved', reasons: why ? [why] : ['Not assigned to a county'], estimated: false };
  }
  const manual = active.some(r => r.method === 'manual');
  const provisional = active.some(r => r.method === 'centroid');

  for (const row of active) {
    if (row.reviewStatus === 'needs_review' && row.reviewReason && !reasons.includes(row.reviewReason)) {
      reasons.push(row.reviewReason);
    }
  }
  let reviewFlag = active.some(r => r.reviewStatus === 'needs_review');

  if (manual && recordedAcres != null && recordedAcres > 0) {
    const sum = active.reduce((s, r) => s + (r.manualAcres ?? 0), 0);
    if (Math.abs(roundTo(sum, 2) - roundTo(recordedAcres, 2)) > ACRES_TOLERANCE) {
      reviewFlag = true;
      reasons.push(`Manual split totals ${roundTo(sum, 2)} ac but recorded acreage is ${roundTo(recordedAcres, 2)} ac`);
    }
  }

  // A reviewer's acknowledgement silences the mapped-vs-recorded difference until geometry changes
  // and the rows are recalculated.
  const acknowledged = active.every(r => r.reviewStatus === 'reviewed');
  let estimated = false;
  if (!manual && !provisional) {
    const mapped = totalMappedAcres(active);
    if (recordedAcres != null && recordedAcres > 0 && mapped > 0) {
      const cmp = compareMappedToRecorded(mapped, recordedAcres);
      if (cmp.needsReview && !acknowledged) {
        reviewFlag = true;
        reasons.push(`Mapped ${cmp.mappedAcres} ac vs recorded ${cmp.recordedAcres} ac`);
      }
      // Multi-county land is allocated from recorded acres unless the two measurements agree.
      estimated = active.filter(r => r.countyFips != null).length > 1 && !cmp.matches;
    }
  }
  if (provisional) estimated = true;

  if (reviewFlag) return { status: 'needs_review', reasons, estimated };
  if (manual) return { status: 'manual', reasons, estimated: false };
  return { status: estimated ? 'estimated' : 'automatic', reasons, estimated };
}

/**
 * Optional county-specific production for one record, when a source captures it.
 * Must add up to the record's total; otherwise it is ignored and the record is allocated by share.
 */
export interface ExplicitCountyAmount {
  countyFips: string | null;
  amount: number;
}

export interface ProductionPart {
  countyFips: string | null;
  countyName: string | null;
  stateAbbr: string | null;
  amount: number;
  /** True when the amount was allocated proportionally rather than recorded for the county. */
  estimated: boolean;
  /** 0..1 share of the record this part holds. */
  fraction: number;
}

export function allocateProduction(
  total: number,
  shares: CountyShare[],
  options: { decimals?: number; explicit?: ExplicitCountyAmount[] } = {},
): ProductionPart[] {
  const decimals = options.decimals ?? 2;
  const explicit = options.explicit;
  if (explicit && explicit.length > 0) {
    const sum = roundTo(explicit.reduce((s, e) => s + e.amount, 0), decimals);
    if (Math.abs(sum - roundTo(total, decimals)) <= Math.pow(10, -decimals) / 2) {
      const meta = new Map(shares.map(s => [s.countyFips, s]));
      return explicit.map(e => ({
        countyFips: e.countyFips,
        countyName: meta.get(e.countyFips)?.countyName ?? null,
        stateAbbr: meta.get(e.countyFips)?.stateAbbr ?? null,
        amount: roundTo(e.amount, decimals),
        estimated: false,
        fraction: total > 0 ? e.amount / total : 0,
      }));
    }
  }
  const parts = allocateAcrossShares(total, shares, decimals);
  // A single-county record needs no allocation: all of it is that county's, measured not estimated.
  const split = shares.length > 1;
  return parts.map(({ share, amount }) => ({
    countyFips: share.countyFips,
    countyName: share.countyName,
    stateAbbr: share.stateAbbr,
    amount,
    estimated: split,
    fraction: share.fraction,
  }));
}
