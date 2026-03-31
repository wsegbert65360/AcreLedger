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
  farm_id: z.string(),
  fsa_farm_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsa_tract_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsa_field_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  producer_share: z.union([z.number(), z.null(), z.undefined()]).optional(),
  irrigation_practice: z.union([z.string(), z.null(), z.undefined()]).optional(),
  intended_use: z.union([z.string(), z.null(), z.undefined()]).optional(),
  boundary: z.unknown().optional(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const binSchema = baseRecordSchema.extend({
  name: z.string(),
  capacity: z.number(),
  farm_id: z.string(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const plantRecordSchema = baseRecordSchema.extend({
  field_id: z.string(),
  field_name: z.union([z.string(), z.undefined()]).optional(),
  seed_variety: z.union([z.string(), z.undefined()]).optional(),
  acreage: z.union([z.number(), z.undefined()]).optional(),
  crop: z.union([z.string(), z.undefined()]).optional(),
  plant_date: z.union([z.string(), z.undefined()]).optional(),
  season_year: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.string(), z.undefined()]).optional(),
  fsa_farm_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsa_tract_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsa_field_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  intended_use: z.union([z.string(), z.null(), z.undefined()]).optional(),
  producer_share: z.union([z.number(), z.null(), z.undefined()]).optional(),
  irrigation_practice: z.union([z.string(), z.null(), z.undefined()]).optional(),
});

const harvestRecordSchema = baseRecordSchema.extend({
  field_id: z.string(),
  field_name: z.union([z.string(), z.undefined()]).optional(),
  destination: z.union([z.string(), z.undefined()]).optional(),
  bin_id: z.union([z.string(), z.null(), z.undefined()]).optional(),
  bushels: z.union([z.number(), z.undefined()]).optional(),
  moisture_percent: z.union([z.number(), z.undefined()]).optional(),
  landlord_split_percent: z.union([z.number(), z.undefined()]).optional(),
  harvest_date: z.union([z.string(), z.undefined()]).optional(),
  season_year: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.string(), z.undefined()]).optional(),
  crop: z.union([z.string(), z.undefined()]).optional(),
  scale_ticket_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  landlord_name: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsa_farm_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  fsa_tract_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
});

const hayRecordSchema = baseRecordSchema.extend({
  field_id: z.string(),
  field_name: z.union([z.string(), z.undefined()]).optional(),
  date: z.union([z.string(), z.undefined()]).optional(),
  bale_count: z.union([z.number(), z.undefined()]).optional(),
  cutting_number: z.union([z.number(), z.undefined()]).optional(),
  bale_type: z.union([z.string(), z.undefined()]).optional(),
  temperature: z.union([z.number(), z.null(), z.undefined()]).optional(),
  conditions: z.union([z.string(), z.null(), z.undefined()]).optional(),
  season_year: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.string(), z.undefined()]).optional(),
});

const fertilizerAppSchema = baseRecordSchema.extend({
  field_id: z.string(),
  date: z.string(),
  acres: z.number(),
  fertilizer_formula: z.string(),
  season_year: z.number().optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
  updated_at: z.union([z.string(), z.undefined()]).optional(),
  field_name: z.union([z.string(), z.undefined()]).optional(),
});

const tillageRecordSchema = baseRecordSchema.extend({
  field_id: z.string(),
  date: z.string(),
  implement_type: z.string(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  season_year: z.number(),
  timestamp: z.union([z.string(), z.undefined()]).optional(),
  field_name: z.union([z.string(), z.undefined()]).optional(),
});

const grainMovementSchema = baseRecordSchema.extend({
  bin_id: z.union([z.string(), z.null(), z.undefined()]).optional(),
  bin_name: z.union([z.string(), z.undefined()]).optional(),
  type: z.enum(['in', 'out']).optional(),
  bushels: z.union([z.number(), z.undefined()]).optional(),
  moisture_percent: z.union([z.number(), z.undefined()]).optional(),
  source_field_name: z.union([z.string(), z.null(), z.undefined()]).optional(),
  destination: z.union([z.string(), z.null(), z.undefined()]).optional(),
  price: z.union([z.number(), z.null(), z.undefined()]).optional(),
  season_year: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.string(), z.undefined()]).optional(),
});

const savedSeedSchema = baseRecordSchema.extend({
  name: z.string(),
  farm_id: z.string(),
  crop: z.union([z.string(), z.null(), z.undefined()]).optional(),
  variety: z.union([z.string(), z.null(), z.undefined()]).optional(),
  supplier: z.union([z.string(), z.null(), z.undefined()]).optional(),
  lot_number: z.union([z.string(), z.null(), z.undefined()]).optional(),
  year: z.union([z.number(), z.null(), z.undefined()]).optional(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const sprayRecipeSchema = baseRecordSchema.extend({
  name: z.string(),
  farm_id: z.string(),
  products: z.unknown().optional(),
  applicator_name: z.union([z.string(), z.undefined()]).optional(),
  license_number: z.union([z.string(), z.undefined()]).optional(),
  target_pest: z.union([z.string(), z.undefined()]).optional(),
  epa_reg_number: z.union([z.string(), z.undefined()]).optional(),
});

const fertilizerRecipeSchema = baseRecordSchema.extend({
  name: z.string(),
  farm_id: z.string(),
  npk_ratio: z.string(),
  created_at: z.union([z.string(), z.undefined()]).optional(),
});

const sprayRecordSchema = baseRecordSchema.extend({
  field_id: z.string(),
  field_name: z.union([z.string(), z.undefined()]).optional(),
  products: z.unknown().optional(),
  wind_speed: z.union([z.number(), z.undefined()]).optional(),
  temperature: z.union([z.number(), z.undefined()]).optional(),
  spray_date: z.union([z.string(), z.null(), z.undefined()]).optional(),
  start_time: z.union([z.string(), z.null(), z.undefined()]).optional(),
  end_time: z.union([z.string(), z.null(), z.undefined()]).optional(),
  equipment_id: z.union([z.string(), z.undefined()]).optional(),
  applicator_name: z.union([z.string(), z.undefined()]).optional(),
  license_number: z.union([z.string(), z.undefined()]).optional(),
  epa_reg_number: z.union([z.string(), z.undefined()]).optional(),
  season_year: z.union([z.number(), z.undefined()]).optional(),
  timestamp: z.union([z.string(), z.undefined()]).optional(),
  target_pest: z.union([z.string(), z.null(), z.undefined()]).optional(),
  wind_direction: z.union([z.string(), z.null(), z.undefined()]).optional(),
  relative_humidity: z.union([z.number(), z.null(), z.undefined()]).optional(),
  treated_area_size: z.union([z.number(), z.null(), z.undefined()]).optional(),
  treated_area_unit: z.union([z.string(), z.undefined()]).optional(),
  total_amount_applied: z.union([z.number(), z.null(), z.undefined()]).optional(),
  involved_technicians: z.union([z.string(), z.null(), z.undefined()]).optional(),
  mixture_rate: z.union([z.string(), z.null(), z.undefined()]).optional(),
  total_mixture_volume: z.union([z.string(), z.null(), z.undefined()]).optional(),
  crop_or_site_treated: z.union([z.string(), z.null(), z.undefined()]).optional(),
  application_method: z.union([z.string(), z.null(), z.undefined()]).optional(),
  rei: z.union([z.string(), z.null(), z.undefined()]).optional(),
  notes: z.union([z.string(), z.null(), z.undefined()]).optional(),
  compliance_profile: z.union([z.string(), z.undefined()]).optional(),
  site_address: z.union([z.string(), z.null(), z.undefined()]).optional(),
  is_premixed: z.union([z.boolean(), z.undefined()]).optional(),
  non_compliant: z.union([z.boolean(), z.undefined()]).optional(),
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
