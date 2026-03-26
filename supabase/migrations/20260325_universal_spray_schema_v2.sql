-- Supplemental migration for universal spray schema
-- Date: 2026-03-25
-- Adds missing columns identified in review

ALTER TABLE public.spray_records 
ADD COLUMN IF NOT EXISTS equipment_id text,
ADD COLUMN IF NOT EXISTS site_address text,
ADD COLUMN IF NOT EXISTS target_pest text,
ADD COLUMN IF NOT EXISTS wind_direction text,
ADD COLUMN IF NOT EXISTS relative_humidity numeric,
ADD COLUMN IF NOT EXISTS involved_technicians text,
ADD COLUMN IF NOT EXISTS mixture_rate text,
ADD COLUMN IF NOT EXISTS total_mixture_volume text,
ADD COLUMN IF NOT EXISTS is_premixed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS non_compliant boolean DEFAULT false;

COMMENT ON COLUMN public.spray_records.equipment_id IS 'Machine or equipment used for application.';
COMMENT ON COLUMN public.spray_records.site_address IS 'Detailed physical address or description of application site.';
