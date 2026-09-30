-- REPLAY-ONLY BASELINE. Do not `supabase db push` this file to an existing
-- project. It is back-dated before every already-applied migration so a
-- disposable database (scripts/verify-supabase-migrations.mjs, PGlite) can
-- rebuild the core schema from checked-in history. On a linked database it
-- would be treated as an out-of-order pending migration and could create
-- missing tables bare (no RLS, grants, or foreign keys) because the later
-- migrations that harden them are already marked applied. Mark it as applied
-- (`supabase migration repair --status applied 20260316090000`) instead.
-- It is a reconstruction, not an authoritative schema-only dump.

-- Reviewed core-table bootstrap for empty `supabase db reset`.
-- Source: current TypeScript row types plus later ADD COLUMN IF NOT EXISTS
-- migrations. This is not a production schema dump. CREATE IF NOT EXISTS is
-- safe on databases that already have these tables.
--
-- Columns introduced by later migrations are intentionally omitted:
-- fields.notes/FSA attributes/operational_acreage/clu_numbers/landlord_name,
-- plant_records FSA attributes/memo/crop_status/crop_sequence/planting_pattern,
-- spray_records universal/advanced compliance columns,
-- fertilizer_applications.field_name,
-- tillage_records.field_name,
-- hay_harvest_records.temperature/conditions,
-- saved_seeds crop/variety/supplier/lot_number/year/notes,
-- profiles.onboarding_complete,
-- harvest_records.scale_ticket_number, harvest_records.landlord_name,
-- harvest_records.crop/fsa_farm_number/fsa_tract_number/harvest_date,
-- grain_movements.price/destination/harvest_record_id/version.

CREATE TABLE IF NOT EXISTS public.farms (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fields (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  name text NOT NULL,
  acreage numeric NOT NULL,
  lat numeric,
  lng numeric,
  boundary jsonb,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.bins (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  name text NOT NULL,
  capacity numeric NOT NULL,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.plant_records (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  field_id uuid NOT NULL,
  field_name text NOT NULL,
  seed_variety text NOT NULL,
  acreage numeric NOT NULL,
  crop text,
  season_year integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.spray_records (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  field_id uuid NOT NULL,
  field_name text NOT NULL,
  products jsonb,
  wind_speed numeric NOT NULL,
  temperature numeric,
  spray_date date,
  start_time text,
  applicator_name text,
  license_number text,
  epa_reg_number text,
  application_rate text,
  rate_unit text,
  treated_area_size numeric,
  total_amount_applied numeric,
  season_year integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.hay_harvest_records (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  field_id uuid NOT NULL,
  field_name text NOT NULL,
  date date NOT NULL,
  bale_count integer NOT NULL,
  cutting_number integer NOT NULL,
  bale_type text NOT NULL,
  season_year integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.saved_seeds (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  name text NOT NULL,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.spray_recipes (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  name text NOT NULL,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicator_name text,
  license_number text,
  target_pest text,
  epa_reg_number text,
  crop_or_site_treated text,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.fertilizer_applications (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  field_id uuid NOT NULL,
  date date NOT NULL,
  acres numeric NOT NULL,
  fertilizer_formula text NOT NULL,
  season_year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tillage_records (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  field_id uuid NOT NULL,
  date date NOT NULL,
  implement_type text NOT NULL,
  notes text,
  season_year integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  farm_id uuid,
  active_season integer
);

CREATE TABLE IF NOT EXISTS public.harvest_records (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  field_id uuid NOT NULL,
  field_name text NOT NULL,
  destination text NOT NULL,
  bin_id uuid,
  bushels numeric NOT NULL,
  moisture_percent numeric NOT NULL,
  landlord_split_percent numeric NOT NULL,
  season_year integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.grain_movements (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  bin_id uuid NOT NULL,
  bin_name text NOT NULL,
  type text NOT NULL,
  bushels numeric NOT NULL,
  moisture_percent numeric NOT NULL,
  source_field_name text,
  season_year integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
