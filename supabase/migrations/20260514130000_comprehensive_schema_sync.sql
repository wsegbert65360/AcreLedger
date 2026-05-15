-- Comprehensive Schema Synchronization
-- Date: 2026-05-14
-- Ensures all columns referenced in BLUEPRINT.md and Frontend Mappers exist in the database.
-- Using IF NOT EXISTS to ensure safety and idempotency.

DO $$
BEGIN
    -- 1. Fields Table Extensions
    ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS fsa_farm_number text;
    ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS fsa_tract_number text;
    ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS fsa_field_number text;
    ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS producer_share numeric;
    ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS irrigation_practice text;
    ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS intended_use text;

    -- 2. Plant Records Table Extensions
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS fsa_farm_number text;
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS fsa_tract_number text;
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS fsa_field_number text;
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS intended_use text;
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS plant_date date;
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS producer_share numeric;
    ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS irrigation_practice text;

    -- 3. Harvest Records Table Extensions
    ALTER TABLE public.harvest_records ADD COLUMN IF NOT EXISTS crop text;
    ALTER TABLE public.harvest_records ADD COLUMN IF NOT EXISTS fsa_farm_number text;
    ALTER TABLE public.harvest_records ADD COLUMN IF NOT EXISTS fsa_tract_number text;
    ALTER TABLE public.harvest_records ADD COLUMN IF NOT EXISTS harvest_date date;

    -- 4. Grain Movements Table Extensions
    ALTER TABLE public.grain_movements ADD COLUMN IF NOT EXISTS price numeric;
    ALTER TABLE public.grain_movements ADD COLUMN IF NOT EXISTS destination text;

    -- 5. Hay Harvest Records Table Extensions
    ALTER TABLE public.hay_harvest_records ADD COLUMN IF NOT EXISTS temperature numeric;
    ALTER TABLE public.hay_harvest_records ADD COLUMN IF NOT EXISTS conditions text;

END $$;

-- Update comments for documentation
COMMENT ON TABLE public.fields IS 'Physical farm fields with FSA identification.';
COMMENT ON COLUMN public.plant_records.plant_date IS 'Actual date of planting for FSA 578 compliance.';
COMMENT ON COLUMN public.harvest_records.harvest_date IS 'Actual date of harvest for insurance and FSA records.';
