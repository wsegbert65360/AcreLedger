-- Universal spray schema migration (consolidated)
-- Date: 2026-03-25
-- Consolidated from v1 + v2 into a single coherent migration.
-- Original v1 added: end_time, crop_or_site_treated, application_method, etc.
-- Original v2 added: equipment_id, site_address, wind_direction, etc.

ALTER TABLE public.spray_records 
ADD COLUMN IF NOT EXISTS end_time text,
ADD COLUMN IF NOT EXISTS crop_or_site_treated text,
ADD COLUMN IF NOT EXISTS application_method text,
ADD COLUMN IF NOT EXISTS treated_area_unit text DEFAULT 'ac',
ADD COLUMN IF NOT EXISTS rei text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS compliance_profile text DEFAULT 'universal',
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

COMMENT ON TABLE public.spray_records IS 'Universal private-applicator spray records for 45+ states.';
COMMENT ON COLUMN public.spray_records.equipment_id IS 'Machine or equipment used for application.';
COMMENT ON COLUMN public.spray_records.site_address IS 'Detailed physical address or description of application site.';
