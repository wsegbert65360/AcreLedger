BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: generic restore upsert for farm-scoped tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._restore_table_for_farm(
  p_table regclass,
  p_rows jsonb,
  p_farm_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_temp_table text := format('tmp_restore_%s', replace(gen_random_uuid()::text, '-', ''));
  v_columns text;
  v_update_columns text;
  v_has_conflict boolean;
  v_rows_affected integer := 0;
BEGIN
  IF p_rows IS NULL OR p_rows = 'null'::jsonb THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Restore payload for % must be a JSON array.', p_table::text;
  END IF;

  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  EXECUTE format(
    'CREATE TEMP TABLE %I (LIKE %s INCLUDING DEFAULTS) ON COMMIT DROP',
    v_temp_table,
    p_table
  );

  EXECUTE format(
    'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%s, $1)',
    v_temp_table,
    p_table
  ) USING p_rows;

  EXECUTE format('UPDATE %I SET farm_id = $1', v_temp_table) USING p_farm_id;

  EXECUTE format(
    'SELECT EXISTS (
      SELECT 1
      FROM %s t
      JOIN %I s ON t.id = s.id
      WHERE t.farm_id <> $1
    )',
    p_table,
    v_temp_table
  ) INTO v_has_conflict USING p_farm_id;

  IF v_has_conflict THEN
    RAISE EXCEPTION 'Restore rejected for %: payload contains IDs owned by another farm.', p_table::text;
  END IF;

  SELECT
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
    string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum)
      FILTER (WHERE a.attname <> 'id')
  INTO v_columns, v_update_columns
  FROM pg_attribute a
  WHERE a.attrelid = p_table
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_columns IS NULL THEN
    RAISE EXCEPTION 'Restore failed for %: no insertable columns found.', p_table::text;
  END IF;

  EXECUTE format(
    'INSERT INTO %s (%s)
     SELECT %s FROM %I
     ON CONFLICT (id)
     DO UPDATE SET %s',
    p_table,
    v_columns,
    v_columns,
    v_temp_table,
    v_update_columns
  );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;
END;
$$;

REVOKE ALL ON FUNCTION public._restore_table_for_farm(regclass, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._restore_table_for_farm(regclass, jsonb, uuid)
    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._restore_table_for_farm_with_conflict(regclass, jsonb, uuid, text[])
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer)
    TO authenticated, service_role;

COMMIT;
