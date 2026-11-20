import type { CountyAssignment, CountyBoundary } from '../types';

/**
 * Synthetic rectangular counties for tests. FIPS codes and names are real labels only;
 * the shapes are NOT real county boundaries. Henry is west of Benton, sharing the line at lng -93.60.
 */
export function rect(minLng: number, minLat: number, maxLng: number, maxLat: number): number[][][] {
  return [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]];
}

export const DATASET = { datasetSource: 'Test fixture', datasetVersion: 'fixture-1' };

export const HENRY: CountyBoundary = {
  fips: '29083', name: 'Henry', stateAbbr: 'MO', stateFips: '29',
  geometry: { type: 'Polygon', coordinates: rect(-93.80, 38.30, -93.60, 38.50) },
  ...DATASET,
};

export const BENTON: CountyBoundary = {
  fips: '29015', name: 'Benton', stateAbbr: 'MO', stateFips: '29',
  geometry: { type: 'Polygon', coordinates: rect(-93.60, 38.30, -93.40, 38.50) },
  ...DATASET,
};

export const COUNTIES = [HENRY, BENTON];

/** About 9.6 ac, entirely in Henry. */
export const IN_HENRY = { type: 'Polygon' as const, coordinates: rect(-93.7010, 38.40, -93.6990, 38.402) };
/** Straddles the line: 3/4 of the width in Henry, 1/4 in Benton (about 55 ac total). */
export const ACROSS_LINE = { type: 'Polygon' as const, coordinates: rect(-93.6045, 38.40, -93.5985, 38.4095) };
export const IN_BENTON = { type: 'Polygon' as const, coordinates: rect(-93.5010, 38.40, -93.4990, 38.402) };

export function row(over: Partial<CountyAssignment> = {}): CountyAssignment {
  return {
    id: 'row-1', farmId: 'farm-a', subjectType: 'field', subjectKey: 'field-1',
    fieldId: 'field-1', tractKey: null, cluNumber: null,
    countyFips: '29083', countyName: 'Henry', stateAbbr: 'MO',
    mappedAcres: 10, proportion: 1, manualAcres: null,
    method: 'geometry', reviewStatus: 'ok', reviewReason: null,
    geometryHash: 'g1:test', datasetSource: 'Test fixture', datasetVersion: 'fixture-1',
    calculatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
    ...over,
  };
}
