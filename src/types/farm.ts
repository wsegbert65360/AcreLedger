export interface Field {
  id: string;
  name: string;
  acreage: number;
  lat: number | null;
  lng: number | null;
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  fsaFieldNumber?: string;
  producerShare?: number; // 0 to 100 (%)
  irrigationPractice?: 'Irrigated' | 'Non-Irrigated';
  intendedUse?: string; // e.g. Grain, Forage, Seed
  farm_id?: string;
  boundary?: {
    type: 'Polygon';
    coordinates: number[][][];
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
  seasonYear: number;
  farm_id?: string;
  deleted_at: string | null;
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
  farm_id?: string;
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
  farm_id?: string;
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
  farm_id?: string;
  deleted_at: string | null;
}

export interface Bin {
  id: string;
  name: string;
  capacity: number;
  farm_id?: string;
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
  farm_id?: string;
  deleted_at: string | null;
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
  farm_id?: string;
  deleted_at: string | null;
}

export interface SprayRecipeProduct {
  id?: string;
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
  farm_id?: string;
  deleted_at: string | null;
}

export interface FertilizerRecipe {
  id: string;
  name: string;
  npkRatio: string;
  farm_id?: string;
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
  created_at: string;
  updated_at: string;
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

export type ActivityRecord =
  | { type: 'plant'; data: PlantRecord }
  | { type: 'spray'; data: SprayRecord }
  | { type: 'harvest'; data: HarvestRecord }
  | { type: 'hay'; data: HayHarvestRecord }
  | { type: 'fertilizer'; data: FertilizerApplication }
  | { type: 'tillage'; data: TillageRecord }
  | { type: 'grain'; data: GrainMovement };
