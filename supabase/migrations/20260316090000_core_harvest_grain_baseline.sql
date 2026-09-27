-- Reconstructed harvest/grain bootstrap for empty `supabase db reset`.
-- Source: current TypeScript row types plus later ADD COLUMN IF NOT EXISTS
-- migrations. This is not a production schema dump. CREATE IF NOT EXISTS is
-- safe on databases that already have these tables.
--
-- Columns introduced by later migrations are intentionally omitted:
-- harvest_records.scale_ticket_number, harvest_records.landlord_name,
-- harvest_records.crop/fsa_farm_number/fsa_tract_number/harvest_date,
-- grain_movements.price/destination/harvest_record_id/version.

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
