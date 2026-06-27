import { getCentroid, hasValidGeometry } from '@/lib/geoHelpers';
import { loadKeyedTractCollections, parseTractKeys, type TractFeature } from '@/lib/tractLookup';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';

export type FieldRainfallLocationSource =
  | 'field_coordinates'
  | 'field_boundary'
  | 'assigned_clu'
  | 'legacy_clu'
  | 'none';

export interface FieldRainfallLocation {
  lat: number | null;
  lng: number | null;
  boundary: Field['boundary'];
  source: FieldRainfallLocationSource;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

async function loadActiveAssignmentFeatures(
  assignments: FieldCluAssignment[],
  fsaTracts: FsaTractImport[],
): Promise<TractFeature[]> {
  if (assignments.length === 0) return [];

  const tractKeys = [...new Set(assignments.map(assignment => assignment.tractKey))];
  const assignmentKeys = new Set(
    assignments.map(assignment => `${assignment.tractKey}:${assignment.cluNumber}`),
  );
  const collections = await loadKeyedTractCollections(tractKeys, fsaTracts);

  return collections.flatMap(({ tractKey, collection }) =>
    collection.features.filter(feature =>
      assignmentKeys.has(`${tractKey}:${feature.properties.cluNumber}`) &&
      hasValidGeometry(feature.geometry),
    ),
  );
}

async function loadLegacyCluFeatures(
  field: Field,
  fsaTracts: FsaTractImport[],
): Promise<TractFeature[]> {
  const legacyClus = new Set(field.cluNumbers?.filter(Boolean) ?? []);
  if (legacyClus.size === 0) return [];

  const tractKeys = parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber);
  if (tractKeys.length === 0) return [];

  const collections = await loadKeyedTractCollections(tractKeys, fsaTracts);
  return collections.flatMap(({ collection }) =>
    collection.features.filter(feature =>
      legacyClus.has(feature.properties.cluNumber) && hasValidGeometry(feature.geometry),
    ),
  );
}

export async function resolveFieldRainfallLocation(
  field: Field,
  cluAssignments: FieldCluAssignment[],
  fsaTracts: FsaTractImport[],
): Promise<FieldRainfallLocation> {
  if (field.lat != null && field.lng != null) {
    return {
      lat: roundCoordinate(field.lat),
      lng: roundCoordinate(field.lng),
      boundary: field.boundary ?? null,
      source: 'field_coordinates',
    };
  }

  if (hasValidGeometry(field.boundary ?? undefined) && field.boundary) {
    const [lat, lng] = getCentroid([{ geometry: field.boundary }]);
    return {
      lat: roundCoordinate(lat),
      lng: roundCoordinate(lng),
      boundary: null,
      source: 'field_boundary',
    };
  }

  const activeAssignments = cluAssignments.filter(
    assignment => assignment.fieldId === field.id && !assignment.deletedAt,
  );
  const assignedFeatures = await loadActiveAssignmentFeatures(activeAssignments, fsaTracts);
  if (assignedFeatures.length > 0) {
    const [lat, lng] = getCentroid(assignedFeatures);
    return {
      lat: roundCoordinate(lat),
      lng: roundCoordinate(lng),
      boundary: null,
      source: 'assigned_clu',
    };
  }

  const legacyFeatures = await loadLegacyCluFeatures(field, fsaTracts);
  if (legacyFeatures.length > 0) {
    const [lat, lng] = getCentroid(legacyFeatures);
    return {
      lat: roundCoordinate(lat),
      lng: roundCoordinate(lng),
      boundary: null,
      source: 'legacy_clu',
    };
  }

  return {
    lat: null,
    lng: null,
    boundary: null,
    source: 'none',
  };
}