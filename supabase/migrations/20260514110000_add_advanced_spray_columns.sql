-- Advanced Spray Compliance Schema Extension
-- Date: 2026-05-14
-- Adds columns for 2026 regulatory standards (Nozzles, Pressure, Speed, etc.)

ALTER TABLE public.spray_records 
ADD COLUMN IF NOT EXISTS nozzle_type text,
ADD COLUMN IF NOT EXISTS nozzle_size text,
ADD COLUMN IF NOT EXISTS pressure_psi numeric,
ADD COLUMN IF NOT EXISTS boom_height numeric,
ADD COLUMN IF NOT EXISTS actual_speed numeric,
ADD COLUMN IF NOT EXISTS wind_speed_end numeric,
ADD COLUMN IF NOT EXISTS wind_direction_end text,
ADD COLUMN IF NOT EXISTS temp_end numeric,
ADD COLUMN IF NOT EXISTS sensitive_area_check boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sensitive_area_notes text;

-- Add comments for documentation
COMMENT ON COLUMN public.spray_records.nozzle_type IS 'Type of nozzle used (e.g. AIXR, TTI).';
COMMENT ON COLUMN public.spray_records.actual_speed IS 'Ground speed of the sprayer in mph.';
COMMENT ON COLUMN public.spray_records.sensitive_area_check IS 'Flag indicating if sensitive area checks were performed.';
