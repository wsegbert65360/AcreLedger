BEGIN;

-- Review-02 M3/M4. Additive only. Does not rewrite user data, drop tables,
-- change RLS, or touch rainfall_settings. spray_records.equipment_id is text
-- (not uuid), so it is skipped. Restore helpers are unchanged: the new
-- composite FKs already reject cross-farm field_id/bin_id on insert.

-- M3: same-farm composite FKs. Inspect structure rather than legacy names.
-- Fail closed on dirty links. Never leave ON DELETE CASCADE on these refs.
DO $$
DECLARE
  v_ref record;
  v_child regclass;
  v_parent regclass;
  v_farm smallint;
  v_column smallint;
  v_parent_farm smallint;
  v_parent_id smallint;
  v_child_type oid;
  v_parent_type oid;
  v_bad_count bigint;
  v_constraint record;
  v_name text;
  v_unique_name text;
BEGIN
  FOR v_ref IN
    SELECT * FROM (VALUES
      ('spray_records', 'field_id', 'fields'),
      ('plant_records', 'field_id', 'fields'),
      ('harvest_records', 'field_id', 'fields'),
      ('harvest_records', 'bin_id', 'bins'),
      ('grain_movements', 'bin_id', 'bins'),
      ('hay_harvest_records', 'field_id', 'fields'),
      ('fertilizer_applications', 'field_id', 'fields'),
      ('tillage_records', 'field_id', 'fields'),
      ('custom_spray_records', 'field_id', 'fields'),
      ('field_clu_assignments', 'field_id', 'fields')
    ) AS refs(child_table, ref_column, parent_table)
  LOOP
    v_child := to_regclass(format('public.%I', v_ref.child_table));
    v_parent := to_regclass(format('public.%I', v_ref.parent_table));
    IF v_child IS NULL OR v_parent IS NULL THEN
      CONTINUE;
    END IF;

    SELECT a.attnum, a.atttypid INTO v_column, v_child_type
    FROM pg_attribute a
    WHERE a.attrelid = v_child AND a.attname = v_ref.ref_column AND NOT a.attisdropped;
    IF v_column IS NULL THEN
      CONTINUE;
    END IF;

    SELECT a.attnum INTO v_farm
    FROM pg_attribute a
    WHERE a.attrelid = v_child AND a.attname = 'farm_id' AND NOT a.attisdropped;
    SELECT a.attnum INTO v_parent_farm
    FROM pg_attribute a
    WHERE a.attrelid = v_parent AND a.attname = 'farm_id' AND NOT a.attisdropped;
    SELECT a.attnum, a.atttypid INTO v_parent_id, v_parent_type
    FROM pg_attribute a
    WHERE a.attrelid = v_parent AND a.attname = 'id' AND NOT a.attisdropped;

    IF v_farm IS NULL OR v_parent_farm IS NULL OR v_parent_id IS NULL THEN
      RAISE EXCEPTION 'Cannot farm-scope %.%: missing farm_id or parent id', v_child, v_ref.ref_column
        USING ERRCODE = '42703';
    END IF;

    -- Skip type-mismatched field/bin refs (e.g. text vs uuid).
    IF v_child_type IS DISTINCT FROM v_parent_type THEN
      RAISE NOTICE 'Skipping farm-scope %.%: type mismatch % vs %',
        v_child, v_ref.ref_column, v_child_type::regtype, v_parent_type::regtype;
      CONTINUE;
    END IF;

    -- Nullable refs are allowed; a non-null ref must match the same farm.
    EXECUTE format(
      'SELECT count(*) FROM %s child WHERE child.%I IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM %s parent WHERE parent.id = child.%I AND parent.farm_id = child.farm_id
       )',
      v_child, v_ref.ref_column, v_parent, v_ref.ref_column
    ) INTO v_bad_count;
    IF v_bad_count > 0 THEN
      RAISE EXCEPTION 'Cannot farm-scope %.%: % invalid link(s)', v_child, v_ref.ref_column, v_bad_count
        USING ERRCODE = '23503';
    END IF;

    v_unique_name := v_ref.parent_table || '_farm_id_id_key';
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = v_parent
        AND conname = v_unique_name
        AND NOT (
          contype IN ('p', 'u')
          AND conkey = ARRAY[v_parent_farm, v_parent_id]::smallint[]
        )
    ) THEN
      RAISE EXCEPTION 'Constraint % exists with an unexpected definition', v_unique_name
        USING ERRCODE = '42809';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = v_parent
        AND contype IN ('p', 'u')
        AND conkey = ARRAY[v_parent_farm, v_parent_id]::smallint[]
    ) THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I UNIQUE (farm_id, id)', v_parent, v_unique_name);
    END IF;

    FOR v_constraint IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = v_child
        AND c.confrelid = v_parent
        AND c.conkey = ARRAY[v_column]::smallint[]
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_child, v_constraint.conname);
    END LOOP;

    -- Replace a composite that still cascades or points at the wrong key.
    FOR v_constraint IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = v_child
        AND c.confrelid = v_parent
        AND c.conkey = ARRAY[v_farm, v_column]::smallint[]
        AND (
          c.confkey <> ARRAY[v_parent_farm, v_parent_id]::smallint[]
          OR c.confdeltype NOT IN ('a', 'r')
          OR c.confupdtype <> 'a'
        )
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_child, v_constraint.conname);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = v_child
        AND c.confrelid = v_parent
        AND c.conkey = ARRAY[v_farm, v_column]::smallint[]
        AND c.confkey = ARRAY[v_parent_farm, v_parent_id]::smallint[]
        AND c.confdeltype IN ('a', 'r')
        AND c.confupdtype = 'a'
    ) THEN
      v_name := v_ref.child_table || '_farm_' || v_ref.ref_column || '_fkey';
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (farm_id, %I)
         REFERENCES %s (farm_id, id) ON DELETE RESTRICT NOT VALID',
        v_child, v_name, v_ref.ref_column, v_parent
      );
    END IF;

    FOR v_constraint IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = v_child
        AND c.confrelid = v_parent
        AND c.conkey = ARRAY[v_farm, v_column]::smallint[]
        AND c.confkey = ARRAY[v_parent_farm, v_parent_id]::smallint[]
        AND NOT c.convalidated
    LOOP
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', v_child, v_constraint.conname);
    END LOOP;
  END LOOP;
END $$;

-- M4: stop inheriting client ALL on new public objects, and strip table
-- privileges clients should not have. Do not rewrite historical migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- Postgres grants EXECUTE on new functions to PUBLIC. Revoking from anon and
-- authenticated does not remove that grant. Per-schema default ACLs can only
-- add privileges, so REVOKE EXECUTE FROM PUBLIC must be global.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres
      REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  END IF;
END $$;

-- Hosted migrations run as postgres, which is not a member of supabase_admin.
-- Changing that role's default privileges would raise 42501 and roll back M3.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    RAISE NOTICE 'Skipped ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: role does not exist';
  ELSIF NOT pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    RAISE NOTICE 'Skipped ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: current_user is not a member';
  ELSE
    BEGIN
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipped ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin: insufficient_privilege';
    END;
  END IF;
END $$;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'farms',
    'profiles',
    'fsa_tract_imports',
    'field_clu_assignments',
    'field_rainfall_hourly',
    'field_rainfall_coverage',
    'field_rainfall_daily',
    'farm_rainfall_daily'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
    END IF;
  END LOOP;
END $$;

-- Existing SECURITY DEFINER functions keep PUBLIC execute unless revoked.
-- Strip PUBLIC/anon; re-grant authenticated/service_role only for RPCs the
-- app calls (src/ stores and services, api/weather-proxy, api/ai-assistant).
-- get_rainfall_stats keeps its earlier GRANT to authenticated; no src/api caller.
DO $$
DECLARE
  fn record;
  v_authenticated text[] := ARRAY[
    'ensure_user_farm',
    'update_farm_name',
    'restore_farm_backup',
    'consume_weather_proxy_request',
    'consume_ai_assistant_request',
    'finalize_ai_assistant_turn',
    'get_offline_sync_row_state',
    'create_harvest_with_grain',
    'soft_delete_harvests_with_grain',
    'soft_delete_grain_movements_versioned',
    'soft_delete_fsa_tract',
    'soft_delete_field_with_clu_assignments',
    'log_maintenance',
    'update_equipment_reading',
    'soft_delete_equipment_cascade',
    'set_equipment_meter_unit'
  ];
  v_service_role text[] := ARRAY[
    'consume_weather_proxy_request',
    'consume_ai_assistant_request',
    'finalize_ai_assistant_turn',
    'get_offline_sync_row_state',
    'soft_delete_harvests_with_grain',
    'soft_delete_fsa_tract',
    'soft_delete_field_with_clu_assignments',
    'log_maintenance',
    'update_equipment_reading',
    'soft_delete_equipment_cascade',
    'set_equipment_meter_unit',
    'rollup_farm_rainfall',
    'rollup_all_farms_daily',
    'rollup_field_rainfall',
    'cleanup_old_rainfall'
  ];
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name, fn.function_name, fn.args
    );
    IF fn.function_name = ANY (v_authenticated) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
        fn.schema_name, fn.function_name, fn.args
      );
    END IF;
    IF fn.function_name = ANY (v_service_role) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
        fn.schema_name, fn.function_name, fn.args
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
