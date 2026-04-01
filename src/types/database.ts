/**
 * Manual type definitions for Supabase table rows.
 * In a production app, these would be generated via 'supabase gen types typescript'.
 *
 * Note on Timestamps: DB stores as ISO string (timestamptz), mappers convert
 * to/from Unix ms numbers for app-level standard.
 *
 * Last synced: 2026-04-01 against live DB schema (OpenAPI) + all migrations.
 */

// ============================================================
// Core / Auth Tables
// ============================================================

export interface FarmRow {
    id: string;
    name: string;
    created_at?: string;
    updated_at?: string;
}

export interface ProfileRow {
    id: string;
    farm_data?: Record<string, unknown> | null;
    updated_at?: string;
    email?: string | null;
    farm_id?: string | null;
    role?: string | null;
    active_season?: number | null;
}

// ============================================================
// Field & Storage Tables
// ============================================================

export interface FieldRow {
    id: string;
    farm_id: string;
    name: string;
    acreage: number;
    lat: number | null;
    lng: number | null;
    fsa_farm_number?: string | null;
    fsa_tract_number?: string | null;
    fsa_field_number?: string | null;
    producer_share?: number | null;
    irrigation_practice?: string | null;
    intended_use?: string | null;
    boundary?: { type: string; coordinates: number[][][] } | null;
    deleted_at?: string | null;
    notes?: string | null;
}

export interface ProductEntry {
    product: string;
    rate: string;
    rateUnit: string;
    epaRegNumber?: string | null;
    activeIngredients?: string | null;
    totalProductAmount?: string | null;
    totalProductUnit?: string | null;
}

export interface BinRow {
    id: string;
    farm_id: string;
    name: string;
    capacity: number;
    created_at?: string;
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
    non_compliant?: boolean | null;
}

export interface SprayRecordRow {
    id: string;
    farm_id: string;
    field_id: string;
    field_name: string;
    products?: ProductEntry[] | null;
    wind_speed: number;
    temperature: number;
    spray_date: string | null;
    start_time: string | null;
    end_time: string | null;
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
    treated_area_unit?: string | null;
    total_amount_applied?: number | null;
    involved_technicians?: string | null;
    mixture_rate?: string | null;
    total_mixture_volume?: string | null;
    site_address?: string | null;
    crop_or_site_treated?: string | null;
    application_method?: string | null;
    rei?: string | null;
    notes?: string | null;
    compliance_profile?: string | null;
    is_premixed?: boolean | null;
    non_compliant?: boolean | null;
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
    landlord_name?: string | null;
    scale_ticket_number?: string | null;
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
    temperature: number | null;
    conditions: string | null;
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
    source_field_name?: string | null;
    destination?: string | null;
    price?: number | null;
    season_year: number;
    timestamp: string;
    deleted_at?: string | null;
}

export interface SavedSeedRow {
    id: string;
    name: string;
    created_at?: string;
    crop?: string | null;
    variety?: string | null;
    supplier?: string | null;
    lot_number?: string | null;
    year?: number | null;
    notes?: string | null;
    farm_id: string;
    deleted_at?: string | null;
}

export interface SprayRecipeRow {
    id: string;
    farm_id: string;
    name: string;
    products: ProductEntry[];
    applicator_name: string;
    license_number: string;
    target_pest: string;
    epa_reg_number: string;
    crop_or_site_treated: string;
    deleted_at?: string | null;
}

export interface FertilizerRecipeRow {
    id: string;
    farm_id: string;
    name: string;
    npk_ratio: string;
    created_at?: string;
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

export interface TillageRecordRow {
    id: string;
    farm_id: string;
    field_id: string;
    field_name?: string;
    date: string;
    implement_type: string;
    notes?: string | null;
    season_year: number;
    timestamp: string;
    deleted_at?: string | null;
}

// ============================================================
// Rainfall / Weather Tables
// ============================================================

export interface FieldRainfallHourlyRow {
    id: string;
    field_id: string;
    timestamp_utc: string;
    rainfall_in: number;
    source: string;
    finalized: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface FieldRainfallCoverageRow {
    field_id: string;
    range_start_utc: string;
    range_end_utc: string;
    status: string;
    last_checked_at?: string;
}

export interface FarmRainfallDailyRow {
    farm_id: string;
    date_local: string;
    avg_rainfall_in: number;
    max_rainfall_in: number;
    min_rainfall_in: number;
    max_hourly_in: number;
    fields_count: number;
    last_updated_at?: string;
}

export interface RainfallSettingsRow {
    farm_id: string;
    key: string;
    value?: string | null;
}
