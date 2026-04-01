-- ============================================================
-- ACRELEDGER MIGRATION: 20260402_critical_security_fixes.sql
-- Purpose: Fix CRITICAL and HIGH severity security vulnerabilities
-- Date: 2026-04-02
--
-- Fixes:
--   VULN-01: farm_rainfall_daily "Service role full access" policy
--            grants ALL users write access (should be service_role only)
--   VULN-03: rollup_all_farms_daily executable by authenticated users
--   VULN-04: Legacy get_field_rainfall_stats has no ownership check
--   VULN-05: rainfall_settings RLS policy references non-existent farm_id
--   VULN-13: field_rainfall_hourly/coverage allow user writes (should be read-only)
-- ============================================================

BEGIN;

-- ============================================================
-- FIX VULN-01: Scope "Service role full access" to service_role only
-- The current policy uses USING (true) WITH CHECK (true) which applies
-- to ALL roles. We must drop and recreate scoped to service_role.
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'farm_rainfall_daily'
      AND policyname = 'Service role full access'
      AND NOT (cmd IN ('*') AND qual = 'true'::text AND with_check = 'true'::text
               AND roles = '{service_role}'::name[])
  ) THEN
    -- Drop the overly permissive policy
    DROP POLICY "Service role full access" ON public.farm_rainfall_daily;
    RAISE NOTICE 'Dropped overly permissive farm_rainfall_daily policy';
  END IF;
END $$;

-- Recreate the policy scoped ONLY to service_role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'farm_rainfall_daily'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.farm_rainfall_daily
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'Created service_role-scoped policy on farm_rainfall_daily';
  END IF;
END $$;

-- ============================================================
-- FIX VULN-03: Revoke authenticated access to rollup_all_farms_daily
-- This SECURITY DEFINER function should only be callable by service_role
-- (it's already called via pg_cron which uses service_role).
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_default_acl a
    JOIN pg_namespace n ON a.objnamespace = n.oid
    JOIN pg_proc p ON p.pronamespace = n.oid
    WHERE p.proname = 'rollup_all_farms_daily'
      AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
  ) OR EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'rollup_all_farms_daily'
      AND grantee = 'authenticated'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rollup_all_farms_daily(date) FROM authenticated;
    RAISE NOTICE 'Revoked authenticated access to rollup_all_farms_daily';
  END IF;
END $$;

-- Ensure service_role can still execute it
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'rollup_all_farms_daily'
      AND grantee = 'service_role'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.rollup_all_farms_daily(date) TO service_role;
    RAISE NOTICE 'Granted service_role access to rollup_all_farms_daily';
  END IF;
END $$;

-- ============================================================
-- FIX VULN-04: Drop legacy get_field_rainfall_stats function
-- This function has NO ownership check — any authenticated user
-- can pass any field_id and retrieve data from any farm.
-- The modern replacement is get_rainfall_stats which has ownership checks.
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'get_field_rainfall_stats'
  ) THEN
    DROP FUNCTION IF EXISTS public.get_field_rainfall_stats(uuid);
    RAISE NOTICE 'Dropped legacy get_field_rainfall_stats function (no ownership check)';
  END IF;
END $$;

-- ============================================================
-- FIX VULN-05: rainfall_settings RLS policy references non-existent farm_id
-- The table only has (key TEXT, value TEXT) — no farm_id column.
-- Since this is a global settings table, we restrict access to
-- service_role only (the cron jobs use it to store/retrieve API keys).
-- ============================================================

-- First, drop any broken policy that references farm_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rainfall_settings'
      AND policyname = 'Farm-scoped access'
  ) THEN
    DROP POLICY "Farm-scoped access" ON public.rainfall_settings;
    RAISE NOTICE 'Dropped broken rainfall_settings policy (referenced non-existent farm_id)';
  END IF;
END $$;

-- Ensure RLS is enabled
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'rainfall_settings' AND rowsecurity = true
  ) THEN
    ALTER TABLE public.rainfall_settings ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on rainfall_settings';
  END IF;
END $$;

-- Create a service_role-only policy (settings are managed by cron/system)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rainfall_settings'
      AND policyname = 'Service role only'
  ) THEN
    CREATE POLICY "Service role only" ON public.rainfall_settings
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'Created service_role-only policy on rainfall_settings';
  END IF;
END $$;

-- ============================================================
-- FIX VULN-13: Restrict field_rainfall_hourly and field_rainfall_coverage
-- to SELECT only for authenticated users (weather data is written by
-- the edge function using service_role, not by users).
-- ============================================================

-- field_rainfall_hourly: Replace any FOR ALL policy with FOR SELECT
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_rainfall_hourly'
      AND cmd = '*'
  ) THEN
    -- Drop any existing FOR ALL policies
    DELETE FROM pg_policies
    WHERE tablename = 'field_rainfall_hourly' AND cmd = '*';
    RAISE NOTICE 'Dropped FOR ALL policies on field_rainfall_hourly';
  END IF;
END $$;

-- Add farm-scoped SELECT policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_rainfall_hourly'
      AND policyname = 'Farm-scoped read'
  ) THEN
    CREATE POLICY "Farm-scoped read" ON public.field_rainfall_hourly
      FOR SELECT TO authenticated
      USING (
        field_id IN (
          SELECT id FROM public.fields
          WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        )
      );
    RAISE NOTICE 'Created SELECT-only policy on field_rainfall_hourly';
  END IF;
END $$;

-- field_rainfall_coverage: Same treatment
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_rainfall_coverage'
      AND cmd = '*'
  ) THEN
    DELETE FROM pg_policies
    WHERE tablename = 'field_rainfall_coverage' AND cmd = '*';
    RAISE NOTICE 'Dropped FOR ALL policies on field_rainfall_coverage';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_rainfall_coverage'
      AND policyname = 'Farm-scoped read'
  ) THEN
    CREATE POLICY "Farm-scoped read" ON public.field_rainfall_coverage
      FOR SELECT TO authenticated
      USING (
        field_id IN (
          SELECT id FROM public.fields
          WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        )
      );
    RAISE NOTICE 'Created SELECT-only policy on field_rainfall_coverage';
  END IF;
END $$;

-- Ensure service_role retains full access for the edge function
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_rainfall_hourly'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.field_rainfall_hourly
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on field_rainfall_hourly';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_rainfall_coverage'
      AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.field_rainfall_coverage
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created service_role policy on field_rainfall_coverage';
  END IF;
END $$;

-- ============================================================
-- FIX VULN-02 (edge function): The mrms-hourly edge function
-- currently accepts anon-key auth. We add a safeguard here by
-- ensuring only service_role can call rollup_field_rainfall directly.
-- (The edge function code itself needs a separate fix in TypeScript)
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'rollup_field_rainfall'
      AND grantee = 'authenticated'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rollup_field_rainfall(uuid, date) FROM authenticated;
    RAISE NOTICE 'Revoked authenticated access to rollup_field_rainfall';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'rollup_field_rainfall'
      AND grantee = 'service_role'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.rollup_field_rainfall(uuid, date) TO service_role;
    RAISE NOTICE 'Granted service_role access to rollup_field_rainfall';
  END IF;
END $$;

COMMIT;
