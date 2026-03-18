-- =============================================
-- ACRELEDGER SECURITY HARDENING MIGRATION (V2 - ROBUST)
-- Purpose: Address Supabase Linter warnings (0011, 0014)
-- Date: 2026-03-18
-- =============================================

-- 1. Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Hardening: Set search_path for flagged functions
-- This block dynamically finds functions by name and applies the security fix.
DO $$
DECLARE
    func_record RECORD;
    flagged_functions TEXT[] := ARRAY[
        'get_rainfall_stats',
        'update_rainfall_coverage_status',
        'update_updated_at_column',
        'cleanup_old_rainfall',
        'rollup_field_rainfall',
        'assign_tenant_id',
        'sync_farm_id_to_auth',
        'handle_new_user'
    ];
BEGIN
    FOR func_record IN 
        SELECT n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.proname = ANY(flagged_functions)
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions', 
                       func_record.schema_name, func_record.function_name, func_record.args);
        RAISE NOTICE 'Secured search_path for function: %.%(%)', 
                     func_record.schema_name, func_record.function_name, func_record.args;
    END LOOP;
END $$;

-- 3. Move pg_net extension to extensions schema (Warning 0014)
-- Note: This is idempotent.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
            ALTER EXTENSION pg_net SET SCHEMA extensions;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'Could not move pg_net to extensions schema. This is expected on some Supabase environments. Please check the Dashboard.';
        END;
    END IF;
END $$;
