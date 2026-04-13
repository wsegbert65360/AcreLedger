import { z } from 'zod';

// ─── Shared field-level validators ─────────────────────────────────────────

const uuidOrString = z.union([z.string().uuid(), z.string()]);

const baseRecordSchema = z.object({
  id: z.string().min(1),
  farm_id: z.string().optional(),
  deleted_at: z.union([z.string(), z.null()]).optional(),
});

// ─── Per-table record schemas ───────────────────────────────────────────────

const fieldSchema = baseRecordSchema.extend({
  name: z.string(),
  acreage: z.number(),
  lat: z.union([z.number(), z.null()]).optional(),
  lng: z.union([z.number(), z.null()]).optional(),
  farm_id: z.string().optional(),
  fsaFarmNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsaTractNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsaFieldNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  producerShare: z.union([z.number(), z.null(), z.undefined()]).optional(),
  irrigationPractice: z.union([z.string(), z.null(), z.undefined()]).optional(),
  intendedUse: z.union([z.string(), z.null(), z.undefined()]).optional(),
  boundary: z.unknown().optional(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const binSchema = baseRecordSchema.extend({
  name: z.string(),
  capacity: z.number(),
  farm_id: z.string().optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const plantRecordSchema = baseRecordSchema.extend({
  fieldId: z.string(),
  fieldName: z.union([z.string(), z.undefined()]).optional(),
  seedVariety: z.union([z.string(), z.undefined()]).optional(),
  acreage: z.union([z.number(), z.undefined()]).optional(),
  crop: z.union([z.string(), z.undefined()]).optional(),
  plantDate: z.union([z.string(), z.undefined()]).optional(),
  seasonYear: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.number(), z.string(), z.undefined()]).optional(),
  fsaFarmNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsaTractNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsaFieldNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  intendedUse: z.union([z.string(), z.null(), z.undefined()]).optional(),
  producerShare: z.union([z.number(), z.null(), z.undefined()]).optional(),
  irrigationPractice: z.union([z.string(), z.null(), z.undefined()]).optional(),
});

const harvestRecordSchema = baseRecordSchema.extend({
  fieldId: z.string(),
  fieldName: z.union([z.string(), z.undefined()]).optional(),
  destination: z.union([z.string(), z.undefined()]).optional(),
  binId: z.union([z.string(), z.null(), z.undefined()]).optional(),
  bushels: z.union([z.number(), z.undefined()]).optional(),
  moisturePercent: z.union([z.number(), z.undefined()]).optional(),
  landlordSplitPercent: z.union([z.number(), z.undefined()]).optional(),
  harvestDate: z.union([z.string(), z.undefined()]).optional(),
  seasonYear: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.number(), z.string(), z.undefined()]).optional(),
  crop: z.union([z.string(), z.undefined()]).optional(),
  scaleTicketNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  landlordName: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsaFarmNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsaTractNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
});

const hayRecordSchema = baseRecordSchema.extend({
  fieldId: z.string(),
  fieldName: z.union([z.string(), z.undefined()]).optional(),
  date: z.union([z.string(), z.undefined()]).optional(),
  baleCount: z.union([z.number(), z.undefined()]).optional(),
  cuttingNumber: z.union([z.number(), z.undefined()]).optional(),
  baleType: z.union([z.string(), z.undefined()]).optional(),
  temperature: z.union([z.number(), z.null(), z.undefined()]).optional(),
  conditions: z.union([z.string(), z.null(), z.undefined()]).optional(),
  seasonYear: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.number(), z.string(), z.undefined()]).optional(),
});

const fertilizerAppSchema = baseRecordSchema.extend({
  fieldId: z.string(),
  date: z.string(),
  acres: z.number(),
  fertilizer_formula: z.string(),
  seasonYear: z.number().optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
  updated_at: z.union([z.string(), z.undefined()]).optional(),
  fieldName: z.union([z.string(), z.undefined()]).optional(),
});

const tillageRecordSchema = baseRecordSchema.extend({
  fieldId: z.string(),
  date: z.string(),
  implementType: z.string(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  seasonYear: z.number(),
  timestamp: z.union([z.number(), z.string(), z.undefined()]).optional(),
  fieldName: z.union([z.string(), z.undefined()]).optional(),
});

const grainMovementSchema = baseRecordSchema.extend({
  binId: z.union([z.string(), z.null(), z.undefined()]).optional(),
  binName: z.union([z.string(), z.undefined()]).optional(),
  type: z.enum(['in', 'out']).optional(),
  bushels: z.union([z.number(), z.undefined()]).optional(),
  moisturePercent: z.union([z.number(), z.undefined()]).optional(),
  sourceFieldName: z.union([z.string(), z.null(), z.undefined()]).optional(),
  destination: z.union([z.string(), z.null(), z.undefined()]).optional(),
  price: z.union([z.number(), z.null(), z.undefined()]).optional(),
  seasonYear: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.number(), z.string(), z.undefined()]).optional(),
});

const savedSeedSchema = baseRecordSchema.extend({
  name: z.string(),
  farm_id: z.string().optional(),
  crop: z.union([z.string(), z.null(), z.undefined()]).optional(),
  variety: z.union([z.string(), z.null(), z.undefined()]).optional(),
  supplier: z.union([z.string(), z.null(), z.undefined()]).optional(),
  lotNumber: z.union([z.string(), z.null(), z.undefined()]).optional(),
  year: z.union([z.number(), z.null(), z.undefined()]).optional(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const sprayRecipeSchema = baseRecordSchema.extend({
  name: z.string(),
  farm_id: z.string().optional(),
  products: z.unknown().optional(),
  applicatorName: z.union([z.string(), z.undefined()]).optional(),
  licenseNumber: z.union([z.string(), z.undefined()]).optional(),
  targetPest: z.union([z.string(), z.undefined()]).optional(),
  epaRegNumber: z.union([z.string(), z.undefined()]).optional(),
});

const fertilizerRecipeSchema = baseRecordSchema.extend({
  name: z.string(),
  farm_id: z.string().optional(),
  npkRatio: z.string(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const sprayRecordSchema = baseRecordSchema.extend({
  fieldId: z.string(),
  fieldName: z.union([z.string(), z.undefined()]).optional(),
  products: z.unknown().optional(),
  windSpeed: z.union([z.number(), z.undefined()]).optional(),
  temperature: z.union([z.number(), z.undefined()]).optional(),
  sprayDate: z.union([z.string(), z.null(), z.undefined()]).optional(),
  startTime: z.union([z.string(), z.null(), z.undefined()]).optional(),
  endTime: z.union([z.string(), z.null(), z.undefined()]).optional(),
  equipmentId: z.union([z.string(), z.undefined()]).optional(),
  applicatorName: z.union([z.string(), z.undefined()]).optional(),
  licenseNumber: z.union([z.string(), z.undefined()]).optional(),
  epaRegNumber: z.union([z.string(), z.undefined()]).optional(),
  seasonYear: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.number(), z.string(), z.undefined()]).optional(),
  targetPest: z.union([z.string(), z.null(), z.undefined()]).optional(),
  windDirection: z.union([z.string(), z.null(), z.undefined()]).optional(),
  relativeHumidity: z.union([z.number(), z.null(), z.undefined()]).optional(),
  treatedAreaSize: z.union([z.number(), z.null(), z.undefined()]).optional(),
  treatedAreaUnit: z.union([z.string(), z.undefined()]).optional(),
  totalAmountApplied: z.union([z.number(), z.null(), z.undefined()]).optional(),
  involvedTechnicians: z.union([z.string(), z.null(), z.undefined()]).optional(),
  mixtureRate: z.union([z.string(), z.null(), z.undefined()]).optional(),
  totalMixtureVolume: z.union([z.string(), z.null(), z.undefined()]).optional(),
  cropOrSiteTreated: z.union([z.string(), z.null(), z.undefined()]).optional(),
  applicationMethod: z.union([z.string(), z.null(), z.undefined()]).optional(),
  rei: z.union([z.string(), z.null(), z.undefined()]).optional(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  complianceProfile: z.union([z.string(), z.undefined()]).optional(),
  siteAddress: z.union([z.string(), z.null(), z.undefined()]).optional(),
  isPremixed: z.union([z.boolean(), z.undefined()]).optional(),
  nonCompliant: z.union([z.boolean(), z.undefined()]).optional(),
});

// ─── Top-level backup schema ────────────────────────────────────────────────

export const backupSchema = z.object({
  fields: z.array(fieldSchema).optional(),
  bins: z.array(binSchema).optional(),
  plantRecords: z.array(plantRecordSchema).optional(),
  sprayRecords: z.array(sprayRecordSchema).optional(),
  harvestRecords: z.array(harvestRecordSchema).optional(),
  hayHarvestRecords: z.array(hayRecordSchema).optional(),
  fertilizerApplications: z.array(fertilizerAppSchema).optional(),
  tillageRecords: z.array(tillageRecordSchema).optional(),
  grainMovements: z.array(grainMovementSchema).optional(),
  savedSeeds: z.array(savedSeedSchema).optional(),
  fertilizerRecipes: z.array(fertilizerRecipeSchema).optional(),
  sprayRecipes: z.array(sprayRecipeSchema).optional(),
  activeSeason: z.number().optional(),
  rolloverDate: z.string().optional(),
  backupDate: z.string().optional(),
}).passthrough();

export type BackupData = z.infer<typeof backupSchema>;
