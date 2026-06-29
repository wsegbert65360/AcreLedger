-- AcreLedger Database Hardening Migration
-- Date: 2026-06-29

-- 1. Fix public.profiles RLS update policy hole
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. Alter foreign keys referencing public.farms(id) on delete action from CASCADE to RESTRICT
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT
            tc.table_name, 
            tc.constraint_name,
            kcu.column_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE 
            tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_schema = 'public'
            AND ccu.table_name = 'farms'
            AND ccu.column_name = 'id'
            AND kcu.column_name = 'farm_id'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE RESTRICT', r.table_name, r.constraint_name);
    END LOOP;
END $$;

-- 3. Create composite performance indexes
-- Indexes for (farm_id, season_year)
CREATE INDEX IF NOT EXISTS idx_plant_records_farm_season ON public.plant_records(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_spray_records_farm_season ON public.spray_records(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_harvest_records_farm_season ON public.harvest_records(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_hay_harvest_records_farm_season ON public.hay_harvest_records(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_fertilizer_apps_farm_season ON public.fertilizer_applications(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_tillage_records_farm_season ON public.tillage_records(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_grain_movements_farm_season ON public.grain_movements(farm_id, season_year);

-- Indexes for (farm_id, deleted_at)
CREATE INDEX IF NOT EXISTS idx_fields_farm_deleted ON public.fields(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bins_farm_deleted ON public.bins(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_plant_records_farm_deleted ON public.plant_records(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_spray_records_farm_deleted ON public.spray_records(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_harvest_records_farm_deleted ON public.harvest_records(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_hay_harvest_records_farm_deleted ON public.hay_harvest_records(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_fertilizer_apps_farm_deleted ON public.fertilizer_applications(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tillage_records_farm_deleted ON public.tillage_records(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_grain_movements_farm_deleted ON public.grain_movements(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_saved_seeds_farm_deleted ON public.saved_seeds(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_fertilizer_recipes_farm_deleted ON public.fertilizer_recipes(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_spray_recipes_farm_deleted ON public.spray_recipes(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_fsa_tract_imports_farm_deleted ON public.fsa_tract_imports(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_field_clu_assignments_farm_deleted ON public.field_clu_assignments(farm_id, deleted_at);
