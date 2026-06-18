import type { Field } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { roundTo } from '@/utils/numbers';

export function calculateFieldCroplandAcres(fieldId: string, cluAssignments: FieldCluAssignment[]): number | null {
  const activeAssignments = cluAssignments.filter(assignment =>
    assignment.fieldId === fieldId && !assignment.deletedAt
  );

  if (activeAssignments.length === 0) return null;

  return roundTo(
    activeAssignments
      .filter(assignment => assignment.landUse === 'cropland')
      .reduce((sum, assignment) => sum + assignment.acres, 0),
    2
  );
}

export function getDisplayFieldAcres(field: Field, cluAssignments: FieldCluAssignment[]): number {
  return calculateFieldCroplandAcres(field.id, cluAssignments) ?? field.acreage;
}

export function buildDisplayFieldAcreMap(fields: Field[], cluAssignments: FieldCluAssignment[]): Map<string, number> {
  return new Map(fields.map(field => [field.id, getDisplayFieldAcres(field, cluAssignments)]));
}
