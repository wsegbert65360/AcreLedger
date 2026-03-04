export interface Field {
  id: string;
  name: string;
  acreage: number;
  lat: number;
  lng: number;
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  fsaFieldNumber?: string;
  producerShare?: number; // 0 to 100 (%)
  irrigationPractice?: 'Irrigated' | 'Non-Irrigated';
  intendedUse?: string; // e.g. Grain, Forage, Seed
  farm_id?: string;
  boundary?: any;
  deleted_at?: string;
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
  seasonYear?: number;
  farm_id?: string;
  deleted_at?: string;
}

export interface SprayRecord {
  id: string;
  fieldId: string;
  fieldName: string;
  product: string;
  products?: SprayRecipeProduct[]; // Granular details for regulatory compliance
  windSpeed: number; // MDA mandatory: wind_speed_mph
  temperature: number; // MDA mandatory: temp_f
  timestamp: number;
  seasonYear?: number;
  farm_id?: string;
  deleted_at?: string;
  // Spray audit / personal license compliance
  applicatorName?: string;
  licenseNumber?: string;
  epaRegNumber?: string; // MDA mandatory: epa_reg_num
  applicationRate?: string;
  rateUnit?: string;
  mixtureRate?: string; // MDA mandatory: mixture_rate
  totalMixtureVolume?: string; // MDA mandatory: total_mixture_volume
  targetPest?: string;
  windDirection?: string; // MDA mandatory: wind_direction
  relativeHumidity?: number;
  sprayDate?: string;
  // Regulatory compliance fields (2 CSR 70-25.120)
  startTime?: string; // MDA mandatory: start_time
  involvedTechnicians?: string;
  siteAddress?: string;
  treatedAreaSize?: string;
  totalAmountApplied?: string;
  equipmentId?: string; // Auditor requirement: Machine ID (e.g. Miller Nitro)
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
  seasonYear?: number;
  // FSA compliance fields
  crop?: string;
  fsaFarmNumber?: string;
  fsaTractNumber?: string;
  harvestDate?: string;
  farm_id?: string;
  deleted_at?: string;
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
  seasonYear?: number;
  timestamp: number;
  farm_id?: string;
  deleted_at?: string;
}

export interface Bin {
  id: string;
  name: string;
  capacity: number;
  farm_id?: string;
  deleted_at?: string;
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
  seasonYear?: number;
  price?: number; // Price per bushel
  destination?: string; // Buyer or location
  farm_id?: string;
  deleted_at?: string;
}

export interface SavedSeed {
  id: string;
  name: string; // e.g. "DKC 64-35"
  farm_id?: string;
  deleted_at?: string;
}

export interface SprayRecipeProduct {
  id?: string;
  product: string;
  rate: string;
  rateUnit: string;
  epaRegNumber?: string; // Granular audit info
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
  deleted_at?: string;
}

export interface FertilizerApplication {
  id: string;
  farm_id: string;
  fieldId: string;
  fieldName: string; // From join
  date: string;
  acres: number;
  fertilizer_formula: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  season_year?: number;
}

export type ActivityRecord =
  | { type: 'plant'; data: PlantRecord }
  | { type: 'spray'; data: SprayRecord }
  | { type: 'harvest'; data: HarvestRecord }
  | { type: 'hay'; data: HayHarvestRecord }
  | { type: 'fertilizer'; data: FertilizerApplication };
