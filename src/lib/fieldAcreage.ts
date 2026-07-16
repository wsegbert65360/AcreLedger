import type { Field, SprayRecord } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { calculateAcreage } from '@/lib/gisService';
import { roundTo } from '@/utils/numbers';

function activeFieldAssignments(fieldId: string, cluAssignments: FieldCluAssignment[]): FieldCluAssignment[] {
  return cluAssignments.filter(assignment => assignment.fieldId === fieldId && !assignment.deletedAt);
}

export function calculateFieldCroplandAcres(fieldId: string, cluAssignments: FieldCluAssignment[]): number | null {
  const activeAssignments = activeFieldAssignments(fieldId, cluAssignments);

  if (activeAssignments.length === 0) return null;

  return roundTo(
    activeAssignments
      .filter(assignment => assignment.landUse === 'cropland')
      .reduce((sum, assignment) => sum + assignment.acres, 0),
    2
  );
}

export function getBoundaryFieldAcres(field: Field, cluAssignments: FieldCluAssignment[]): number | null {
  if (field.boundaryAcreage != null && Number.isFinite(field.boundaryAcreage) && field.boundaryAcreage > 0) {
    return roundTo(field.boundaryAcreage, 2);
  }

  if (field.boundary) {
    const calculated = calculateAcreage(field.boundary);
    if (calculated > 0) return calculated;
  }

  // Once assignments exist, legacy field.acreage may be their sum rather than
  // the original boundary value. Do not mislabel that ambiguous value.
  if (activeFieldAssignments(field.id, cluAssignments).length > 0) return null;

  return Number.isFinite(field.acreage) && field.acreage > 0 ? roundTo(field.acreage, 2) : null;
}

export function getDisplayFieldAcres(field: Field, cluAssignments: FieldCluAssignment[]): number {
  return calculateFieldCroplandAcres(field.id, cluAssignments)
    ?? getBoundaryFieldAcres(field, cluAssignments)
    ?? field.acreage;
}

export function getEffectiveSprayTreatedAcres(
  record: Pick<SprayRecord, 'treatedAreaSize'>,
  field?: Field,
  cluAssignments: FieldCluAssignment[] = [],
): number | null {
  if (
    record.treatedAreaSize != null
    && Number.isFinite(record.treatedAreaSize)
    && record.treatedAreaSize > 0
  ) {
    return record.treatedAreaSize;
  }

  return field ? getDisplayFieldAcres(field, cluAssignments) : null;
}

export function resolveRestoredBoundaryAcres(
  field: Field,
  cluAssignments: FieldCluAssignment[],
  existingBoundaryAcres?: number | null,
): number {
  if (field.boundaryAcreage != null && Number.isFinite(field.boundaryAcreage) && field.boundaryAcreage > 0) {
    return field.boundaryAcreage;
  }

  if (existingBoundaryAcres != null && Number.isFinite(existingBoundaryAcres) && existingBoundaryAcres > 0) {
    return existingBoundaryAcres;
  }

  if (field.boundary) {
    const calculated = calculateAcreage(field.boundary);
    if (calculated > 0) return calculated;
  }

  const hasActiveAssignments = activeFieldAssignments(field.id, cluAssignments).length > 0;
  if (!hasActiveAssignments && Number.isFinite(field.acreage) && field.acreage > 0) {
    return field.acreage;
  }

  // The database column is NOT NULL. Zero means "unknown" for a newly restored
  // legacy field whose raw acreage may already be a CLU total; never guess.
  return 0;
}

export function buildDisplayFieldAcreMap(fields: Field[], cluAssignments: FieldCluAssignment[]): Map<string, number> {
  return new Map(fields.map(field => [field.id, getDisplayFieldAcres(field, cluAssignments)]));
}
