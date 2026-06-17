import type { TractFeatureCollection } from '@/lib/tractLookup';

export type CluLandUse = 'cropland' | 'non_cropland';

export interface FsaTractImport {
  id: string;
  farmId: string;
  tractKey: string;
  filename: string;
  featureCount: number;
  geojson: TractFeatureCollection;
  importedAt: string;
  deletedAt: string | null;
}

export interface FieldCluAssignment {
  id: string;
  farmId: string;
  fieldId: string;
  tractKey: string;
  cluNumber: string;
  acres: number;
  landUse: CluLandUse;
  assignedAt: string;
  deletedAt: string | null;
}
