import { z } from 'zod';

const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const geoJsonMultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.array(z.number())))),
});

const geoJsonGeometrySchema = z.union([geoJsonPolygonSchema, geoJsonMultiPolygonSchema]);

const tractFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: geoJsonGeometrySchema,
  properties: z.object({
    cluNumber: z.string(),
    acres: z.number(),
  }).strict(),
}).strict();

const tractFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(tractFeatureSchema),
}).strict();

const sprayProductSchema = z.object({
  id: z.string().optional(),
  ui_id: z.string().optional(),
  product: z.string(),
  rate: z.string(),
  rateUnit: z.string(),
  epaRegNumber: z.string().optional(),
  activeIngredients: z.string().optional(),
  totalProductAmount: z.string().optional(),
  totalProductUnit: z.string().optional(),
});

export const fieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  acreage: z.number(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  fsaFarmNumber: z.string().optional(),
  fsaTractNumber: z.string().optional(),
  fsaFieldNumber: z.string().optional(),
  producerShare: z.number().optional(),
  irrigationPractice: z.string().optional(),
  intendedUse: z.string().optional(),
  boundary: geoJsonGeometrySchema.nullable().optional(),
  cluNumbers: z.array(z.string()).optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
  notes: z.string().optional(),
}).strict();

export const binSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const plantRecordSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  fieldName: z.string().optional(),
  seedVariety: z.string().optional(),
  acreage: z.number(),
  crop: z.string().optional(),
  plantDate: z.string().optional(),
  fsaFarmNumber: z.string().optional(),
  fsaTractNumber: z.string().optional(),
  fsaFieldNumber: z.string().optional(),
  intendedUse: z.string().optional(),
  producerShare: z.number().optional(),
  irrigationPractice: z.string().optional(),
  cropStatus: z.string().optional(),
  cropSequence: z.string().optional(),
  plantingPattern: z.string().optional(),
  seasonYear: z.number(),
  timestamp: z.number().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
  memo: z.string().optional(),
}).strict();

export const sprayRecordSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  fieldName: z.string().optional(),
  products: z.array(sprayProductSchema).optional(),
  windSpeed: z.number().optional(),
  temperature: z.number().optional(),
  sprayDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  equipmentId: z.string().optional(),
  applicatorName: z.string().optional(),
  licenseNumber: z.string().optional(),
  epaRegNumber: z.string().optional(),
  seasonYear: z.number(),
  timestamp: z.number().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
  targetPest: z.string().optional(),
  windDirection: z.string().optional(),
  relativeHumidity: z.number().optional(),
  treatedAreaSize: z.number().optional(),
  treatedAreaUnit: z.string().optional(),
  totalAmountApplied: z.number().optional(),
  involvedTechnicians: z.string().optional(),
  mixtureRate: z.string().optional(),
  totalMixtureVolume: z.string().optional(),
  siteAddress: z.string().optional(),
  cropOrSiteTreated: z.string().optional(),
  applicationMethod: z.string().optional(),
  rei: z.string().optional(),
  notes: z.string().optional(),
  complianceProfile: z.string().optional(),
  isPremixed: z.boolean().optional(),
  nonCompliant: z.boolean().optional(),
  nozzleType: z.string().optional(),
  nozzleSize: z.string().optional(),
  pressurePsi: z.number().optional(),
  boomHeight: z.number().optional(),
  actualSpeed: z.number().optional(),
  windSpeedEnd: z.number().optional(),
  windDirectionEnd: z.string().optional(),
  tempEnd: z.number().optional(),
  sensitiveAreaCheck: z.boolean().optional(),
  sensitiveAreaNotes: z.string().optional(),
}).strict();

export const harvestRecordSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  fieldName: z.string().optional(),
  destination: z.string().optional(),
  binId: z.string().optional(),
  bushels: z.number(),
  moisturePercent: z.number().optional(),
  landlordSplitPercent: z.number().optional(),
  harvestDate: z.string().optional(),
  fsaFarmNumber: z.string().optional(),
  fsaTractNumber: z.string().optional(),
  seasonYear: z.number(),
  timestamp: z.number().optional(),
  crop: z.string().optional(),
  landlordName: z.string().optional(),
  scaleTicketNumber: z.string().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const hayHarvestRecordSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  fieldName: z.string().optional(),
  date: z.string().optional(),
  baleCount: z.number(),
  cuttingNumber: z.number().optional(),
  baleType: z.string().optional(),
  temperature: z.number().optional(),
  conditions: z.string().optional(),
  seasonYear: z.number(),
  timestamp: z.number().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const grainMovementSchema = z.object({
  id: z.string(),
  farm_id: z.string(),
  binId: z.string(),
  binName: z.string().optional(),
  type: z.string().optional(),
  bushels: z.number(),
  moisturePercent: z.number().optional(),
  sourceFieldName: z.string().optional(),
  destination: z.string().optional(),
  price: z.number().optional(),
  seasonYear: z.number(),
  timestamp: z.number().optional(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const savedSeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  crop: z.string().optional(),
  variety: z.string().optional(),
  supplier: z.string().optional(),
  lotNumber: z.string().optional(),
  year: z.number().optional(),
  notes: z.string().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const fertilizerRecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  npkRatio: z.string().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const sprayRecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  products: z.array(sprayProductSchema).optional(),
  applicatorName: z.string().optional(),
  licenseNumber: z.string().optional(),
  targetPest: z.string().optional(),
  epaRegNumber: z.string().optional(),
  farm_id: z.string(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const fertilizerApplicationSchema = z.object({
  id: z.string(),
  farm_id: z.string(),
  fieldId: z.string(),
  fieldName: z.string().optional(),
  date: z.string().optional(),
  acres: z.number(),
  fertilizer_formula: z.string().optional(),
  timestamp: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  deleted_at: z.string().nullable().optional(),
  seasonYear: z.number(),
}).strict();

export const tillageRecordSchema = z.object({
  id: z.string(),
  farm_id: z.string(),
  fieldId: z.string(),
  fieldName: z.string().optional(),
  date: z.string().optional(),
  implementType: z.string().optional(),
  notes: z.string().optional(),
  seasonYear: z.number(),
  timestamp: z.number().optional(),
  deleted_at: z.string().nullable().optional(),
}).strict();

export const fsaTractImportSchema = z.object({
  id: z.string(),
  farmId: z.string(),
  tractKey: z.string(),
  filename: z.string(),
  featureCount: z.number(),
  geojson: tractFeatureCollectionSchema,
  importedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
}).strict();

export const fieldCluAssignmentSchema = z.object({
  id: z.string(),
  farmId: z.string(),
  fieldId: z.string(),
  tractKey: z.string(),
  cluNumber: z.string(),
  acres: z.number(),
  landUse: z.enum(['cropland', 'non_cropland']),
  assignedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
}).strict();

export const backupSchema = z.object({
  fields: z.array(fieldSchema).optional(),
  bins: z.array(binSchema).optional(),
  plantRecords: z.array(plantRecordSchema).optional(),
  sprayRecords: z.array(sprayRecordSchema).optional(),
  harvestRecords: z.array(harvestRecordSchema).optional(),
  hayHarvestRecords: z.array(hayHarvestRecordSchema).optional(),
  fertilizerApplications: z.array(fertilizerApplicationSchema).optional(),
  tillageRecords: z.array(tillageRecordSchema).optional(),
  grainMovements: z.array(grainMovementSchema).optional(),
  savedSeeds: z.array(savedSeedSchema).optional(),
  fertilizerRecipes: z.array(fertilizerRecipeSchema).optional(),
  sprayRecipes: z.array(sprayRecipeSchema).optional(),
  fsaTracts: z.array(fsaTractImportSchema).optional(),
  cluAssignments: z.array(fieldCluAssignmentSchema).optional(),
  activeSeason: z.number().optional(),
  backupDate: z.string().optional(),
  rolloverDate: z.string().optional(),
}).strict();

export type BackupData = z.infer<typeof backupSchema>;
