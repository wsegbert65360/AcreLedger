import type { FsaFallCountyContext } from '@/lib/complianceReports/fsaReports';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { buildCountyIndex, resolveFieldCountyShares } from './resolve';
import type { CountyAssignment, FieldCountyShares } from './types';

/**
 * Every report reads counties through this one function, so screen, CSV and PDF can never
 * allocate differently. It only reads saved assignments: no geometry work, no network.
 */
export function buildCountyReportContext(input: {
  farmId: string | null;
  fields: Field[];
  cluAssignments: FieldCluAssignment[];
  countyAssignments: CountyAssignment[];
}): FsaFallCountyContext & { fieldsWithoutCounty: number } {
  const rows = input.farmId ? input.countyAssignments.filter(r => r.farmId === input.farmId) : [];
  const index = buildCountyIndex(rows);
  const fieldById = new Map(input.fields.map(f => [f.id, f]));
  const cache = new Map<string, FieldCountyShares>();
  const sharesForField = (fieldId: string): FieldCountyShares => {
    const cached = cache.get(fieldId);
    if (cached) return cached;
    const field = fieldById.get(fieldId);
    const resolved = field
      ? resolveFieldCountyShares(field, input.cluAssignments, index)
      : resolveFieldCountyShares({ id: fieldId, acreage: 0 }, [], index);
    cache.set(fieldId, resolved);
    return resolved;
  };
  const fieldsWithoutCounty = input.fields.filter(f => !f.deleted_at
    && sharesForField(f.id).shares.every(s => s.countyFips == null)).length;
  return { sharesForField, fieldsWithoutCounty };
}
