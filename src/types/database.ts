/**
 * Manual type definitions for Supabase table rows.
 * In a production app, these would be generated via 'supabase gen types typescript'.
 */

export interface FieldRow {
    id: string;
    farm_id: string;
    name: string;
    acreage: number;
    lat: number;
    lng: number;
    fsa_farm_number?: string | null;
    fsa_tract_number?: string | null;
    fsa_field_number?: string | null;
    producer_share?: number | null;
    irrigation_practice?: string | null;
    intended_use?: string | null;
    boundary?: any;
    deleted_at?: string | null;
}

export interface BinRow {
    id: string;
    farm_id: string;
    name: string;
    capacity: number;
    deleted_at?: string | null;
}

export interface PlantRecordRow {
    id: string;
    farm_id: string;
    field_id: string;
    field_name: string;
    seed_variety: string;
    acreage: number;
    crop: string;
    plant_date: string;
    fsa_farm_number?: string | null;
    fsa_tract_number?: string | null;
    fsa_field_number?: string | null;
    intended_use?: string | null;
    producer_share?: number | null;
    irrigation_practice?: string | null;
    season_year: number;
    timestamp: string;
    deleted_at?: string | null;
}

export interface SprayRecordRow {
    id: string;
    farm_id: string;
    field_id: string;
    field_name: string;
    products?: any[];
    wind_speed: number;
    temperature: number;
    spray_date: string;
    start_time: string;
    equipment_id: string;
    applicator_name: string;
    license_number: string;
    epa_reg_number: string;
    season_year: number;
    timestamp: string;
    deleted_at?: string | null;
    target_pest?: string | null;
    wind_direction?: string | null;
    relative_humidity?: number | null;
    treated_area_size?: number | null;
    total_amount_applied?: number | null;
    involved_technicians?: string | null;
    mixture_rate?: string | null;
    total_mixture_volume?: string | null;
}

export interface HarvestRecordRow {
    id: string;
    farm_id: string;
    field_id: string;
    field_name: string;
    destination: string;
    bin_id?: string | null;
    bushels: number;
    moisture_percent: number;
    landlord_split_percent: number;
    harvest_date: string;
    fsa_farm_number?: string | null;
    fsa_tract_number?: string | null;
    season_year: number;
    timestamp: string;
    crop: string;
    deleted_at?: string | null;
}

export interface HayHarvestRow {
    id: string;
    farm_id: string;
    field_id: string;
    field_name: string;
    date: string;
    bale_count: number;
    cutting_number: number;
    bale_type: string;
    temperature: number;
    conditions: string;
    season_year: number;
    timestamp: string;
    deleted_at?: string | null;
}

export interface GrainMovementRow {
    id: string;
    farm_id: string;
    bin_id: string;
    bin_name: string;
    type: 'in' | 'out';
    bushels: number;
    moisture_percent: number;
    source_field_name: string;
    destination: string;
    price?: number | null;
    season_year: number;
    timestamp: string;
    deleted_at?: string | null;
}

export interface SavedSeedRow {
    id: string;
    farm_id: string;
    name: string;
    deleted_at?: string | null;
}

export interface SprayRecipeRow {
    id: string;
    farm_id: string;
    name: string;
    products: any[];
    applicator_name: string;
    license_number: string;
    target_pest: string;
    epa_reg_number: string;
    deleted_at?: string | null;
}

export interface FertilizerApplicationRow {
    id: string;
    farm_id: string;
    field_id: string;
    date: string;
    acres: number;
    fertilizer_formula: string;
    season_year: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    fields?: { name: string };
    field_name?: string;
}
