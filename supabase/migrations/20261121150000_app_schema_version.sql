-- Schema-before-app check for deploys.
--
-- Returns the newest applied migration version. The Vercel build
-- (scripts/verify-prod-schema.mjs) compares it with the newest file in
-- supabase/migrations and fails the deploy when production is behind, so an
-- app build never ships ahead of the schema it needs. Exposes only a
-- migration timestamp; no farm data.

CREATE OR REPLACE FUNCTION public.app_schema_version()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version text;
BEGIN
  -- A database built outside the Supabase CLI has no migration history.
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT max(version) FROM supabase_migrations.schema_migrations' INTO v_version;
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.app_schema_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_schema_version() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.app_schema_version() IS
  'Newest applied migration version, for the deploy-time schema-before-app check.';
