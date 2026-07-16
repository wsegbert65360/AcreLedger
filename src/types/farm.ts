/** Minimal shared fields used by ActivityFeed to render any record type without `any` casts. */
export interface ActivityRecordBase {
  id: string;
  timestamp?: number;
  date?: string;
  plantDate?: string;
  sprayDate?: string;
  harvestDate?: string;
}

export interface Field {
  id: string;
  name: string;
  acreage: number;
  /** Stable boundary/manual acreage; stored in the legacy operational_acreage DB column. */
  boundaryAcreage?: number;
  lat: number | null;
  lng: number | null;
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  fsaFieldNumber?: string;
  producerShare?: number; // 0 to 100 (%)
  landlordName?: string; // field-level owner/landlord for landlord summary reporting
  irrigationPractice?: 'Irrigated' | 'Non-Irrigated';
  intendedUse?: string; // e.g. Grain, Forage, Seed
  farm_id: string;
  cluNumbers?: string[];
  boundary?: {
    type: 'Polygon';
    coordinates: number[][][];
  } | {
    type: 'MultiPolygon';
    coordinates: number[][][][];
  } | null;
  deleted_at: string | null;
  activitySummary?: {
    planted: boolean;
    sprayed: number;
    fertilized: number;
  };
  notes?: string;
}

export interface PlantRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  seedVariety: string;
  acreage: number;
  timestamp: number;
  // FSA compliance fields
  crop?: string;
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  fsaFieldNumber?: string;
  intendedUse?: string;
  plantDate?: string;
  producerShare?: number; // FSA 578 mandatory: 0 to 100 (%)
  irrigationPractice?: 'Irrigated' | 'Non-Irrigated'; // FSA 578 mandatory: IR or NI
  cropStatus?: 'Planted' | 'Prevented Planting' | 'Failed' | 'Volunteer' | 'Cover Crop';
  cropSequence?: 'First Crop' | 'Second Crop';
  plantingPattern?: string;
  seasonYear: number;
  farm_id: string;
  deleted_at: string | null;
  memo?: string;
}

export interface SprayRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  products?: SprayRecipeProduct[];
  windSpeed: number;
  temperature: number;
  timestamp: number;
  seasonYear: number;
  farm_id: string;
  deleted_at: string | null;
  // Applicator Identity
  applicatorName?: string;
  licenseNumber?: string;
  // Application Details
  sprayDate?: string;
  startTime?: string;
  endTime?: string;
  siteAddress?: string;
  cropOrSiteTreated?: string;
  targetPest?: string;
  applicationMethod?: string;
  // Use / Area
  treatedAreaSize?: number;
  treatedAreaUnit?: string; // Default 'ac'
  // Weather (Extended)
  windDirection?: string;
  relativeHumidity?: number;
  // Other Compliance
  rei?: string;
  equipmentId?: string;
  notes?: string;
  complianceProfile?: string; // e.g. 'universal'
  nonCompliant?: boolean;
  // Advanced Compliance (2026 Standards)
  nozzleType?: string;
  nozzleSize?: string;
  pressurePsi?: number;
  boomHeight?: number;
  actualSpeed?: number;
  windSpeedEnd?: number;
  windDirectionEnd?: string;
  tempEnd?: number;
  sensitiveAreaCheck?: boolean;
  sensitiveAreaNotes?: string;
  // Legacy support
  involvedTechnicians?: string;
  epaRegNumber?: string;
  applicationRate?: string;
  rateUnit?: string;
  mixtureRate?: string;
  totalMixtureVolume?: string;
  totalAmountApplied?: number;
  isPremixed?: boolean;
}

export interface HarvestRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  destination: 'bin' | 'town';
  binId?: string;
  moisturePercent: number;
  landlordSplitPercent: number;
  bushels: number;
  timestamp: number;
  seasonYear: number;
  // FSA compliance fields
  crop?: string;
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  harvestDate?: string;
  landlordName?: string;
  scaleTicketNumber?: string;
  farm_id: string;
  deleted_at: string | null;
}

export interface HayHarvestRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  date: string;
  baleCount: number;
  cuttingNumber: number;
  baleType: 'Round' | 'Square';
  temperature?: number;
  conditions?: string;
  seasonYear: number;
  timestamp: number;
  farm_id: string;
  deleted_at: string | null;
}

export interface Bin {
  id: string;
  name: string;
  capacity: number;
  farm_id: string;
  deleted_at: string | null;
}

export interface GrainMovement {
  id: string;
  binId: string;
  binName: string;
  type: 'in' | 'out';
  bushels: number;
  moisturePercent: number;
  sourceFieldName?: string;
  timestamp: number;
  seasonYear: number;
  price?: number; // Price per bushel
  destination?: string; // Buyer or location
  farm_id: string;
  deleted_at: string | null;
  harvestRecordId?: string;
}

export interface SavedSeed {
  id: string;
  name: string; // Display name
  crop: string;
  variety: string;
  supplier: string;
  lotNumber: string;
  year: number;
  notes: string;
  farm_id: string;
  deleted_at: string | null;
}

export interface SprayRecipeProduct {
  id?: string;
  ui_id?: string;
  product: string;
  rate: string;
  rateUnit: string;
  epaRegNumber?: string;
  activeIngredients?: string;
  totalProductAmount?: string;
  totalProductUnit?: string;
}

export interface SprayRecipe {
  id: string;
  name: string;
  products: SprayRecipeProduct[];
  applicatorName?: string;
  licenseNumber?: string;
  targetPest?: string;
  epaRegNumber?: string; // Kept for backward compatibility/summary
  cropOrSiteTreated?: string;
  farm_id: string;
  deleted_at: string | null;
}

export interface FertilizerRecipe {
  id: string;
  name: string;
  npkRatio: string;
  farm_id: string;
  deleted_at: string | null;
}

export interface FertilizerApplication {
  id: string;
  farm_id: string;
  fieldId: string;
  fieldName: string; // From join
  date: string;
  acres: number;
  fertilizer_formula: string;
  /** Unix ms timestamp representing when this application record was created */
  timestamp: number;
  deleted_at: string | null;
  seasonYear: number;
}

export interface TillageRecord {
  id: string;
  farm_id: string;
  fieldId: string;
  fieldName: string;
  date: string;
  implementType: string;
  notes?: string;
  seasonYear: number;
  timestamp: number;
  deleted_at: string | null;
}

export interface CustomSprayRecord {
  id: string;
  farm_id: string;
  fieldId: string;
  fieldName: string;
  /** ISO date the application was performed. */
  date: string;
  /** Local time the application was performed (HH:mm). */
  applicationTime?: string;
  /** Who performed the application — outside-party company or person. */
  applicator: string;
  /** Free-text tank mix / recipe (e.g. "Roundup 32oz/ac + AMS"). */
  recipe?: string;
  windSpeed?: number;
  windDirection?: string;
  temperature?: number;
  notes?: string;
  seasonYear: number;
  timestamp: number;
  deleted_at: string | null;
}

export type ActivityRecord =
  | { type: 'plant'; data: PlantRecord }
  | { type: 'spray'; data: SprayRecord }
  | { type: 'customSpray'; data: CustomSprayRecord }
  | { type: 'harvest'; data: HarvestRecord }
  | { type: 'hay'; data: HayHarvestRecord }
  | { type: 'fertilizer'; data: FertilizerApplication }
  | { type: 'tillage'; data: TillageRecord }
  | { type: 'grain'; data: GrainMovement };
