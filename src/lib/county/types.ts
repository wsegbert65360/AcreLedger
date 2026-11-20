import type { GeoJSONGeometry } from '@/lib/geoHelpers';

/** What a county assignment describes: one CLU polygon of an FSA tract, or one field. */
export type CountySubjectType = 'clu' | 'field';

/**
 * How a saved county row was produced.
 * - geometry: polygon intersected with county boundaries
 * - centroid: a single location point looked up in a county; provisional only
 * - manual: the user set the county or the acreage split
 * - unresolved: geometry missing or unusable; no county is guessed
 */
export type CountyAssignmentMethod = 'geometry' | 'centroid' | 'manual' | 'unresolved';

/** Persisted review state. Display status is derived by `deriveCountyStatus`. */
export type CountyReviewStatus = 'ok' | 'needs_review' | 'reviewed';

/** What the farmer sees on a tract or field. */
export type CountyDisplayStatus = 'automatic' | 'estimated' | 'manual' | 'unresolved' | 'needs_review';

export interface CountyBoundary {
  /** Five-digit county FIPS (state + county), e.g. "29083". */
  fips: string;
  name: string;
  stateAbbr: string;
  stateFips: string;
  geometry: GeoJSONGeometry;
  datasetSource: string;
  datasetVersion: string;
}

export interface CountyBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** One saved row: a subject's overlap with one county (or its unresolved marker). */
export interface CountyAssignment {
  id: string;
  farmId: string;
  subjectType: CountySubjectType;
  /** `fieldId` for fields; `tractKey:cluNumber` for CLUs. Unique only within a farm. */
  subjectKey: string;
  fieldId: string | null;
  tractKey: string | null;
  cluNumber: string | null;
  /** Null only on an unresolved row. */
  countyFips: string | null;
  countyName: string | null;
  stateAbbr: string | null;
  /** Geodesic area of the subject inside this county. Never the app's recorded acreage. */
  mappedAcres: number | null;
  /** Share of the subject's mapped area in this county, 0..1. */
  proportion: number | null;
  /** Manual corrections only: the acres the user assigned to this county. */
  manualAcres: number | null;
  method: CountyAssignmentMethod;
  reviewStatus: CountyReviewStatus;
  reviewReason: string | null;
  /** Hash of the geometry the row was calculated (or manually corrected) against. */
  geometryHash: string | null;
  datasetSource: string | null;
  datasetVersion: string | null;
  calculatedAt: string;
  deletedAt: string | null;
}

export interface CountyShare {
  /** Null = county unknown. */
  countyFips: string | null;
  countyName: string | null;
  stateAbbr: string | null;
  /** Fraction of the subject, 0..1; shares of one subject sum to 1. */
  fraction: number;
}

export type CountyShareBasis = 'manual' | 'field-geometry' | 'clu-geometry' | 'point' | 'unresolved';

export interface FieldCountyShares {
  basis: CountyShareBasis;
  shares: CountyShare[];
  /** True when any figure allocated from these shares is an estimate rather than a measurement. */
  estimated: boolean;
  needsReview: boolean;
}
