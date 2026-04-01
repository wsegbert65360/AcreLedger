-- ============================================================
-- ACRELEDGER MIGRATION: 20260401_enable_rls_all_tables.sql
-- Purpose: Enable Row Level Security on all core business tables
--          that currently lack it. This is a CRITICAL security fix.
--
-- Tables already having RLS (skip here):
--   field_rainfall_hourly, field_rainfall_coverage,
--   fertilizer_recipes, tillage_records
--
-- Tables gaining RLS in this migration:
--   farms, profiles, fields, bins, plant_records, spray_records,
--   harvest_records, hay_harvest_records, fertilizer_applications,
--   grain_movements, saved_seeds, spray_recipes, farm_rainfall_daily
-- ============================================================

BEGIN;

-- ============================================================
-- 1. profiles — Users can only manage their own profile
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'profiles' AND rowsecurity = true) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON public.profiles
      FOR SELECT USING (id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.profiles
      FOR UPDATE USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 2. farms — Users can only see their own farm
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'farms' AND rowsecurity = true) THEN
    ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'farms' AND policyname = 'Users can view own farm'
  ) THEN
    CREATE POLICY "Users can view own farm" ON public.farms
      FOR SELECT USING (
        id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'farms' AND policyname = 'Users can update own farm'
  ) THEN
    CREATE POLICY "Users can update own farm" ON public.farms
      FOR ALL USING (
        id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 3. fields — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'fields' AND rowsecurity = true) THEN
    ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fields' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.fields
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 4. bins — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'bins' AND rowsecurity = true) THEN
    ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bins' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.bins
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 5. plant_records — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'plant_records' AND rowsecurity = true) THEN
    ALTER TABLE public.plant_records ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'plant_records' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.plant_records
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 6. spray_records — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'spray_records' AND rowsecurity = true) THEN
    ALTER TABLE public.spray_records ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'spray_records' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.spray_records
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 7. harvest_records — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'harvest_records' AND rowsecurity = true) THEN
    ALTER TABLE public.harvest_records ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'harvest_records' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.harvest_records
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 8. hay_harvest_records — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'hay_harvest_records' AND rowsecurity = true) THEN
    ALTER TABLE public.hay_harvest_records ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hay_harvest_records' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.hay_harvest_records
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 9. fertilizer_applications — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'fertilizer_applications' AND rowsecurity = true) THEN
    ALTER TABLE public.fertilizer_applications ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fertilizer_applications' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.fertilizer_applications
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 10. grain_movements — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'grain_movements' AND rowsecurity = true) THEN
    ALTER TABLE public.grain_movements ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'grain_movements' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.grain_movements
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 11. saved_seeds — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'saved_seeds' AND rowsecurity = true) THEN
    ALTER TABLE public.saved_seeds ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_seeds' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.saved_seeds
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 12. spray_recipes — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'spray_recipes' AND rowsecurity = true) THEN
    ALTER TABLE public.spray_recipes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'spray_recipes' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.spray_recipes
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 13. farm_rainfall_daily — Farm-scoped read access
--    (written by cron/service role, read by users)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'farm_rainfall_daily' AND rowsecurity = true) THEN
    ALTER TABLE public.farm_rainfall_daily ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'farm_rainfall_daily' AND policyname = 'Farm-scoped read'
  ) THEN
    CREATE POLICY "Farm-scoped read" ON public.farm_rainfall_daily
      FOR SELECT USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'farm_rainfall_daily' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.farm_rainfall_daily
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 14. rainfall_settings — Farm-scoped access
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'rainfall_settings' AND rowsecurity = true) THEN
    ALTER TABLE public.rainfall_settings ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rainfall_settings' AND policyname = 'Farm-scoped access'
  ) THEN
    CREATE POLICY "Farm-scoped access" ON public.rainfall_settings
      FOR ALL USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 15. Ensure existing rainfall tables have proper policies
--     (RLS was enabled but policies may be missing for service role)
-- ============================================================

-- Service role bypasses RLS automatically, but let's make sure
-- the cron-triggered edge function can write to rainfall tables.
-- The service_role key already bypasses RLS, so no extra policy needed.

COMMIT;
