-- PG17 hardening: remove only MAINTAIN from API roles and PUBLIC.
-- Rollback: supabase/rollbacks/20261101000000_db_hardening_maintain_search_path_rollback.sql
-- The rollback restores the 22 observed authenticated grants, not broader defaults.
-- postgres cannot change supabase_admin defaults. New public relations created by
-- that role must explicitly REVOKE MAINTAIN FROM anon, authenticated, PUBLIC.
-- Schema-local revokes cannot cancel additive global default grants.
-- No event trigger is installed.
DO $hardening$
DECLARE
  relation record;
  role_name text;
  routine record;
BEGIN
  FOR relation IN
    SELECT n.nspname, c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY c.oid
  LOOP
    IF pg_catalog.to_regclass(format('%I.%I', relation.nspname, relation.relname)) IS NOT NULL THEN
      EXECUTE format('REVOKE MAINTAIN ON TABLE %I.%I FROM PUBLIC', relation.nspname, relation.relname);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE MAINTAIN ON TABLE %I.%I FROM %I', relation.nspname, relation.relname, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM %I', role_name);

        END IF;
      END LOOP;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot alter postgres default privileges; owner must revoke MAINTAIN for future public relations.';
  END;

  IF pg_catalog.to_regprocedure('acreage_backfill_private.historical_backfills_retired()') IS NOT NULL
    AND NOT EXISTS (
      SELECT FROM pg_catalog.pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass
        AND d.objid = pg_catalog.to_regprocedure('acreage_backfill_private.historical_backfills_retired()')
        AND d.deptype = 'e'
    ) THEN
    IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_proc p, unnest(p.proconfig) config
      WHERE p.oid = pg_catalog.to_regprocedure('acreage_backfill_private.historical_backfills_retired()')
        AND config = 'search_path=""'
    ) THEN
      ALTER FUNCTION acreage_backfill_private.historical_backfills_retired() SET search_path = '';
    END IF;
  END IF;

  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ANY (ARRAY['public', 'acreage_backfill_private', 'ai_assistant_private', 'trial_private', 'usage_private'])
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT FROM unnest(p.proconfig) config WHERE config LIKE 'search_path=%')
      AND NOT EXISTS (SELECT FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    ORDER BY p.oid
  LOOP
    RAISE NOTICE 'Unpinned function left unchanged: %', routine.signature;
  END LOOP;
END
$hardening$;
