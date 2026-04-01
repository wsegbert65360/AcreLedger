-- Add non_compliant flag to plant_records
-- Mirrors the spray_records.non_compliant column for FSA compliance tracking
ALTER TABLE public.plant_records
  ADD COLUMN IF NOT EXISTS non_compliant boolean NOT NULL DEFAULT false;
