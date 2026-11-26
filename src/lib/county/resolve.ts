import { roundTo } from '@/utils/numbers';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { activeRows, deriveCountyStatus, sharesFromRows } from './allocation';
import type { CountyAssignment, CountyShare, CountySubjectType, FieldCountyShares } from './types';

export const cluSubjectKey = (tractKey: string, cluNumber: string): string => `${tractKey}:${cluNumber}`;
export const fieldSubjectKey = (fieldId: string): string => fieldId;

export function subjectIndexKey(type: CountySubjectType, subjectKey: string): string {
  return `${type}|${subjectKey}`;
}

export type CountyIndex = Map<string, CountyAssignment[]>;

/** Active rows grouped by subject. Rows of one farm only: callers pass a single farm's rows. */
export function buildCountyIndex(assignments: CountyAssignment[]): CountyIndex {
  const index: CountyIndex = new Map();
  for (const row of assignments) {
    if (row.deletedAt) continue;
    const key = subjectIndexKey(row.subjectType, row.subjectKey);
    const list = index.get(key);
    if (list) list.push(row);
    else index.set(key, [row]);
  }
  return index;
}

const UNKNOWN_SHARES: CountyShare[] = [{ countyFips: null, countyName: null, stateAbbr: null, fraction: 1 }];

function mergeShares(parts: { shares: CountyShare[]; weight: number }[]): CountyShare[] {
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (!(totalWeight > 0)) return UNKNOWN_SHARES;
  const merged = new Map<string, CountyShare>();
  for (const { shares, weight } of parts) {
    for (const share of shares) {
      const key = share.countyFips ?? '';
      const fraction = (weight / totalWeight) * share.fraction;
      const existing = merged.get(key);
      if (existing) existing.fraction += fraction;
      else merged.set(key, { ...share, fraction });
    }
  }
  const list = [...merged.values()];
  // Known counties first, biggest share first, unknown last, so output order is stable.
  return list.sort((a, b) =>
    Number(a.countyFips == null) - Number(b.countyFips == null)
    || b.fraction - a.fraction
    || (a.countyFips ?? '').localeCompare(b.countyFips ?? ''));
}

function allUnknown(shares: CountyShare[]): boolean {
  return shares.every(s => s.countyFips == null);
}

export function fieldRecordedAcres(field: Pick<Field, 'acreage' | 'boundaryAcreage'>): number {
  const value = field.boundaryAcreage && field.boundaryAcreage > 0 ? field.boundaryAcreage : field.acreage;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Which counties a field is in, and how it divides.
 *
 * Order of authority: the user's manual correction, the field's own boundary, the CLUs assigned
 * to the field (each by its own geometry, weighted by assigned acres), a provisional location
 * point, then unknown. A tract's county split is never applied to a field as a whole.
 */
export function resolveFieldCountyShares(
  field: Pick<Field, 'id' | 'acreage' | 'boundaryAcreage'>,
  cluAssignments: FieldCluAssignment[],
  index: CountyIndex,
): FieldCountyShares {
  const recorded = fieldRecordedAcres(field);
  const fieldRows = activeRows(index.get(subjectIndexKey('field', fieldSubjectKey(field.id))) ?? []);
  const fieldStatus = fieldRows.length > 0 ? deriveCountyStatus(fieldRows, recorded) : null;
  const fieldIsManual = fieldRows.some(r => r.method === 'manual' && r.countyFips != null);
  const fieldIsGeometry = fieldRows.some(r => r.method === 'geometry' && r.countyFips != null);
  const fieldIsPoint = fieldRows.some(r => r.method === 'centroid' && r.countyFips != null);

  if (fieldIsManual || fieldIsGeometry) {
    const shares = sharesFromRows(fieldRows);
    return {
      basis: fieldIsManual ? 'manual' : 'field-geometry',
      shares,
      estimated: shares.length > 1,
      needsReview: fieldStatus?.status === 'needs_review',
    };
  }

  const cluParts: { shares: CountyShare[]; weight: number }[] = [];
  let cluNeedsReview = false;
  let cluAnyResolved = false;
  // Weight cropland CLUs only: production and planted acres come from
  // cropland, so a woods or waterway CLU in another county must not pull a
  // share there. With no cropland CLU, fall back to all of the field's CLUs.
  const fieldClus = cluAssignments.filter(a => !a.deletedAt && a.fieldId === field.id);
  const croplandClus = fieldClus.filter(a => (a.landUse || 'cropland') === 'cropland');
  for (const assignment of croplandClus.length > 0 ? croplandClus : fieldClus) {
    const rows = activeRows(index.get(subjectIndexKey('clu', cluSubjectKey(assignment.tractKey, assignment.cluNumber))) ?? []);
    const shares = rows.length > 0 ? sharesFromRows(rows) : UNKNOWN_SHARES;
    if (!allUnknown(shares)) cluAnyResolved = true;
    if (rows.length > 0 && deriveCountyStatus(rows, assignment.acres).status === 'needs_review') cluNeedsReview = true;
    cluParts.push({ shares, weight: assignment.acres });
  }
  if (cluParts.length > 0 && cluAnyResolved) {
    const shares = mergeShares(cluParts);
    return {
      basis: 'clu-geometry',
      shares,
      // CLUs wholly in one county measure that county; a CLU that straddles is allocated by share.
      estimated: shares.filter(s => s.countyFips != null).length > 1 || shares.some(s => s.countyFips == null),
      needsReview: cluNeedsReview || shares.some(s => s.countyFips == null),
    };
  }

  if (fieldIsPoint) {
    return { basis: 'point', shares: sharesFromRows(fieldRows), estimated: true, needsReview: true };
  }

  return { basis: 'unresolved', shares: UNKNOWN_SHARES, estimated: false, needsReview: false };
}

export function fractionPercent(fraction: number): number {
  return roundTo(fraction * 100, 2);
}

export function countyLabel(share: { countyName: string | null; stateAbbr: string | null }): string {
  if (!share.countyName) return 'County unknown';
  return share.stateAbbr ? `${share.countyName}, ${share.stateAbbr}` : share.countyName;
}
