-- Create migration for universal spray schema
-- Date: 2026-03-25

ALTER TABLE public.spray_records 
ADD COLUMN IF NOT EXISTS end_time text,
ADD COLUMN IF NOT EXISTS crop_or_site_treated text,
ADD COLUMN IF NOT EXISTS application_method text,
ADD COLUMN IF NOT EXISTS treated_area_unit text DEFAULT 'ac',
ADD COLUMN IF NOT EXISTS rei text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS compliance_profile text DEFAULT 'universal';

-- Comment explaining the transition
COMMENT ON TABLE public.spray_records IS 'Universal private-applicator spray records for 45+ states.';
