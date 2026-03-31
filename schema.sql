-- ============================================================
-- ACRELEDGER — Definitive Database Schema
-- Generated: 2026-04-01
-- Source of truth: supabase/migrations/ + live DB (OpenAPI)
-- Note: Core tables (profiles, farms, fields, bins, etc.) were
--       originally created via the Supabase Dashboard. This file
--       represents their full final state after all migrations.
-- ============================================================

-- ============================================================
-- 1. FARMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.farms (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT farms_pkey PRIMARY KEY (id)
);

-- ============================================================
-- 2. PROFILES (linked to Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    farm_data jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    email text,
    farm_id uuid,
    role text DEFAULT 'admin'::text,
    active_season integer DEFAULT (EXTRACT(year FROM now()))::integer,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
    CONSTRAINT profiles_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 3. FIELDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fields (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    name text NOT NULL,
    acreage numeric NOT NULL,
    lat numeric,
    lng numeric,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    fsa_farm_number text,
    fsa_tract_number text,
    fsa_field_number text,
    producer_share numeric,
    irrigation_practice text,
    intended_use text,
    boundary jsonb,
    notes text,
    CONSTRAINT fields_pkey PRIMARY KEY (id),
    CONSTRAINT fields_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 4. BINS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bins (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    name text NOT NULL,
    capacity numeric NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bins_pkey PRIMARY KEY (id),
    CONSTRAINT bins_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 5. PLANT RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plant_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    field_id uuid NOT NULL,
    field_name text,
    seed_variety text,
    acreage numeric,
    crop text,
    plant_date date,
    season_year integer,
    timestamp timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    fsa_farm_number text,
    fsa_tract_number text,
    fsa_field_number text,
    intended_use text,
    producer_share numeric,
    irrigation_practice text,
    CONSTRAINT plant_records_pkey PRIMARY KEY (id),
    CONSTRAINT plant_records_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT plant_records_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id)
);

-- ============================================================
-- 6. SPRAY RECORDS (universal private-applicator compliance)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spray_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    field_id uuid NOT NULL,
    field_name text,
    products jsonb,
    wind_speed numeric,
    temperature numeric,
    spray_date date,
    start_time time without time zone,
    equipment_id text,
    applicator_name text,
    license_number text,
    epa_reg_number text,
    season_year integer,
    timestamp timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    target_pest text,
    wind_direction text,
    relative_humidity numeric,
    treated_area_size numeric DEFAULT 0,
    treated_area_unit text DEFAULT 'ac'::text,
    total_amount_applied numeric DEFAULT 0,
    involved_technicians text,
    mixture_rate text,
    total_mixture_volume text,
    end_time text,
    crop_or_site_treated text,
    application_method text,
    rei text,
    notes text,
    compliance_profile text DEFAULT 'universal'::text,
    site_address text,
    is_premixed boolean DEFAULT false,
    non_compliant boolean DEFAULT false,
    CONSTRAINT spray_records_pkey PRIMARY KEY (id),
    CONSTRAINT spray_records_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT spray_records_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id)
);

COMMENT ON TABLE public.spray_records IS 'Universal private-applicator spray records for 45+ states.';
COMMENT ON COLUMN public.spray_records.equipment_id IS 'Machine or equipment used for application.';
COMMENT ON COLUMN public.spray_records.site_address IS 'Detailed physical address or description of application site.';
COMMENT ON COLUMN public.spray_records.treated_area_size IS 'Numeric area treated (e.g., acres). Converted from text on 2026-03-31.';
COMMENT ON COLUMN public.spray_records.total_amount_applied IS 'Numeric total product amount. Converted from text on 2026-03-31.';

-- ============================================================
-- 7. HARVEST RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.harvest_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    field_id uuid NOT NULL,
    field_name text,
    destination text,
    bin_id uuid,
    bushels numeric,
    moisture_percent numeric,
    landlord_split_percent numeric,
    harvest_date date,
    season_year integer,
    timestamp timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    fsa_farm_number text,
    fsa_tract_number text,
    crop text,
    scale_ticket_number text,
    landlord_name text,
    CONSTRAINT harvest_records_pkey PRIMARY KEY (id),
    CONSTRAINT harvest_records_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT harvest_records_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id),
    CONSTRAINT harvest_records_bin_id_fkey FOREIGN KEY (bin_id) REFERENCES public.bins(id)
);

-- ============================================================
-- 8. HAY HARVEST RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hay_harvest_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    field_id uuid NOT NULL,
    field_name text,
    date date,
    bale_count integer,
    cutting_number integer,
    bale_type text,
    temperature numeric,
    conditions text,
    season_year integer,
    timestamp timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT hay_harvest_records_pkey PRIMARY KEY (id),
    CONSTRAINT hay_harvest_records_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT hay_harvest_records_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id)
);

-- ============================================================
-- 9. FERTILIZER APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fertilizer_applications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    field_id uuid NOT NULL,
    date date NOT NULL,
    acres numeric NOT NULL,
    fertilizer_formula text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    season_year integer NOT NULL DEFAULT (EXTRACT(year FROM now()))::integer,
    field_name text,
    CONSTRAINT fertilizer_applications_pkey PRIMARY KEY (id),
    CONSTRAINT fertilizer_applications_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT fertilizer_applications_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id)
);

-- ============================================================
-- 10. FERTILIZER RECIPES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fertilizer_recipes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    name text NOT NULL,
    npk_ratio text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT fertilizer_recipes_pkey PRIMARY KEY (id),
    CONSTRAINT fertilizer_recipes_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 11. TILLAGE RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tillage_records (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    field_id uuid NOT NULL,
    date date NOT NULL,
    implement_type text NOT NULL,
    notes text,
    season_year integer NOT NULL,
    timestamp timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    field_name text,
    CONSTRAINT tillage_records_pkey PRIMARY KEY (id),
    CONSTRAINT tillage_records_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT tillage_records_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id)
);

-- ============================================================
-- 12. GRAIN MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.grain_movements (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    bin_id uuid,
    bin_name text,
    type text,
    bushels numeric,
    moisture_percent numeric,
    source_field_name text,
    destination text,
    price numeric,
    season_year integer,
    timestamp timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT grain_movements_pkey PRIMARY KEY (id),
    CONSTRAINT grain_movements_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id),
    CONSTRAINT grain_movements_bin_id_fkey FOREIGN KEY (bin_id) REFERENCES public.bins(id)
);

-- ============================================================
-- 13. SAVED SEEDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saved_seeds (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    name text NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    crop text,
    variety text,
    supplier text,
    lot_number text,
    year integer,
    notes text,
    CONSTRAINT saved_seeds_pkey PRIMARY KEY (id),
    CONSTRAINT saved_seeds_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 14. SPRAY RECIPES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spray_recipes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    farm_id uuid NOT NULL,
    name text NOT NULL,
    products jsonb,
    deleted_at timestamp with time zone,
    applicator_name text,
    license_number text,
    target_pest text,
    epa_reg_number text,
    CONSTRAINT spray_recipes_pkey PRIMARY KEY (id),
    CONSTRAINT spray_recipes_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 15. FIELD RAINFALL HOURLY (weather data)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_rainfall_hourly (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    field_id uuid NOT NULL,
    timestamp_utc timestamp with time zone NOT NULL,
    rainfall_in numeric DEFAULT 0,
    source text DEFAULT 'MRMS'::text,
    finalized boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT field_rainfall_hourly_pkey PRIMARY KEY (id),
    CONSTRAINT field_rainfall_hourly_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id),
    CONSTRAINT field_rainfall_hourly_field_time_unique UNIQUE (field_id, timestamp_utc)
);

-- ============================================================
-- 16. FIELD RAINFALL COVERAGE (tracking gaps)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_rainfall_coverage (
    field_id uuid NOT NULL,
    range_start_utc timestamp with time zone NOT NULL,
    range_end_utc timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text,
    last_checked_at timestamp with time zone DEFAULT now(),
    CONSTRAINT field_rainfall_coverage_pkey PRIMARY KEY (field_id, range_start_utc),
    CONSTRAINT field_rainfall_coverage_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id)
);

-- ============================================================
-- 17. FARM RAINFALL DAILY (precomputed summaries)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.farm_rainfall_daily (
    farm_id uuid NOT NULL,
    date_local date NOT NULL,
    avg_rainfall_in numeric DEFAULT 0,
    max_rainfall_in numeric DEFAULT 0,
    min_rainfall_in numeric DEFAULT 0,
    max_hourly_in numeric DEFAULT 0,
    fields_count integer DEFAULT 0,
    last_updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT farm_rainfall_daily_pkey PRIMARY KEY (farm_id, date_local),
    CONSTRAINT farm_rainfall_daily_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);

-- ============================================================
-- 18. RAINFALL SETTINGS (per-farm configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rainfall_settings (
    farm_id uuid NOT NULL,
    key text NOT NULL,
    value text,
    CONSTRAINT rainfall_settings_pkey PRIMARY KEY (farm_id, key),
    CONSTRAINT rainfall_settings_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES public.farms(id)
);
