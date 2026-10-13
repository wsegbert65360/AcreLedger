-- Review 02 access hardening (2026-10-11 production catalog).
--
-- Account creation already exists in production and was missing from this
-- history. These definitions match that behavior, with two hardenings:
--   * handle_new_user writes profiles(id, email) only. farm_id never comes
--     from signup metadata. profiles.id is the primary key, so
--     ON CONFLICT (id) DO NOTHING only skips a repeat signup; it does not
--     hide a conflict on any other column or overwrite farm membership.
--   * assign_tenant_id fills a null farm_id from the caller's profile first
--     (the tenant anchor), then from auth.jwt() -> app_metadata. It never
--     reads user metadata.
-- sync_farm_id_to_auth copies profiles.farm_id into auth.users
-- raw_app_meta_data, leaving every other app_metadata key in place.
--
-- Client roles cannot execute the trigger functions or the rainfall rollup
-- and cleanup functions. pg_cron runs as postgres, the function owner, and
-- keeps EXECUTE. service_role is granted the rollup and cleanup functions.
--
-- Parked: public.rainfall_settings and any key stored there stay as they are.

BEGIN;

-- The reconstructed baseline never created profiles.email. Production already
-- has the column; this is a no-op there. handle_new_user writes it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.assign_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_farm_id uuid;
  v_claim text;
BEGIN
  IF NEW.farm_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.farm_id
    INTO v_farm_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid();

  IF v_farm_id IS NULL THEN
    -- Server-controlled claim only. A missing or malformed value leaves
    -- farm_id null rather than aborting the write or trusting signup metadata.
    v_claim := NULLIF(auth.jwt() -> 'app_metadata' ->> 'farm_id', '');
    IF v_claim IS NOT NULL THEN
      BEGIN
        v_farm_id := v_claim::uuid;
      EXCEPTION
        WHEN invalid_text_representation THEN
          v_farm_id := NULL;
      END;
    END IF;
  END IF;

  NEW.farm_id := v_farm_id;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sync_farm_id_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF NEW.farm_id IS NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) - 'farm_id'
    WHERE id = NEW.id;
  ELSE
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('farm_id', NEW.farm_id)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Supabase may restrict dropping triggers on auth.users. Preserve the existing
-- signup trigger; CREATE OR REPLACE above updates its function in place.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$do$;

DROP TRIGGER IF EXISTS tr_sync_farm_id_to_auth ON public.profiles;
CREATE TRIGGER tr_sync_farm_id_to_auth
  AFTER INSERT OR UPDATE OF farm_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_farm_id_to_auth();

-- Legacy permissive reads. Absent in the 2026-10-11 catalog; dropped
-- defensively. field_rainfall_daily is not created by this history.
DO $do$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'field_rainfall_hourly',
    'field_rainfall_coverage',
    'field_rainfall_daily'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        'Allow authenticated read access',
        tbl
      );
    END IF;
  END LOOP;
END
$do$;

DROP VIEW IF EXISTS public.rainfall_coverage_gaps;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_farm_id_to_auth() FROM PUBLIC, anon, authenticated;

-- Production may contain overloads absent from replay history. Revoke every
-- public overload of these rollup and cleanup functions.
DO $do$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(ARRAY[
        'rollup_farm_rainfall',
        'rollup_all_farms_daily',
        'rollup_field_rainfall',
        'cleanup_old_rainfall'
      ])
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      fn.schema_name, fn.function_name, fn.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      fn.schema_name, fn.function_name, fn.args
    );
  END LOOP;
END
$do$;

COMMIT;
