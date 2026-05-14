-- Security Hardening: Explicit Data API Grants
-- Requirement: Starting May 2026, Supabase requires explicit GRANTs for Data API access.
-- This script future-proofs the project for the October 2026 enforcement deadline.

-- List of tables to grant access to
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'farms',
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
        'spray_recipes',
        'profiles'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Grant to authenticated users (standard app usage)
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
        
        -- Grant to anonymous users (typically for initial auth/public checks)
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
        
        -- Grant all to service_role (backups/admin tasks)
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
        
        -- Ensure RLS is enabled (safety measure)
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;
