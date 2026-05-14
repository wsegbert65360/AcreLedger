-- Security Fix: Restore Access Policies and Grants
-- Date: 2026-05-14
-- Fixes regressions introduced in 20260513 hardening migration.

-- 1. Explicit Data API Grants for Rainfall Tables
-- These tables were missed in the 20260513 hardening migration.
DO $$
DECLARE
    t text;
    rain_tables text[] := ARRAY[
        'field_rainfall_hourly',
        'field_rainfall_coverage',
        'farm_rainfall_daily'
    ];
BEGIN
    FOREACH t IN ARRAY rain_tables LOOP
        -- Grant to authenticated users
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
        
        -- Grant to anonymous users
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
        
        -- Grant all to service_role
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
        
        -- Ensure RLS is enabled
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- 2. RLS Policies for Core Farm Tables
-- These tables were locked down with ENABLE RLS but no policies were added in 20260513.
DO $$
DECLARE
    t text;
    farm_scoped_tables text[] := ARRAY[
        'fields',
        'bins',
        'plant_records',
        'spray_records',
        'harvest_records',
        'hay_harvest_records',
        'fertilizer_applications',
        'tillage_records',
        'grain_movements',
        'saved_seeds',
        'fertilizer_recipes',
        'spray_recipes'
    ];
BEGIN
    FOREACH t IN ARRAY farm_scoped_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Users can access their farm data" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Users can access their farm data" ON public.%I
            FOR ALL
            TO authenticated
            USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))
            WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))', t);
    END LOOP;
END $$;

-- 3. Special Case: Profiles
-- Users should be able to read and update their own profile.
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
CREATE POLICY "Users can manage their own profile" ON public.profiles
    FOR ALL
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 4. Special Case: Farms
-- Users should be able to read the farm they belong to.
DROP POLICY IF EXISTS "Users can see their farm" ON public.farms;
CREATE POLICY "Users can see their farm" ON public.farms
    FOR SELECT
    TO authenticated
    USING (id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));

-- 5. Special Case: Rainfall Tables (Farm Scoped)
-- field_rainfall_hourly and coverage already had policies, but let's ensure they are robust.
DROP POLICY IF EXISTS "Users see only their farm rainfall" ON public.field_rainfall_hourly;
CREATE POLICY "Users see only their farm rainfall" ON public.field_rainfall_hourly
    FOR SELECT
    TO authenticated
    USING (field_id IN (SELECT id FROM public.fields WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Users see only their farm rainfall coverage" ON public.field_rainfall_coverage;
CREATE POLICY "Users see only their farm rainfall coverage" ON public.field_rainfall_coverage
    FOR SELECT
    TO authenticated
    USING (field_id IN (SELECT id FROM public.fields WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())));

-- 6. farm_rainfall_daily Policy
-- Pre-computed summaries should also be farm-isolated.
DROP POLICY IF EXISTS "Users see only their farm rainfall summaries" ON public.farm_rainfall_daily;
CREATE POLICY "Users see only their farm rainfall summaries" ON public.farm_rainfall_daily
    FOR SELECT
    TO authenticated
    USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
