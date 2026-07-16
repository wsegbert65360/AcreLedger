BEGIN;

-- Restore one JSON row at a time so columns absent from an older backup are
-- genuinely omitted from INSERT/UPDATE. This preserves database defaults for
-- new rows and preserves existing values for matching rows instead of turning
-- every missing property into NULL through jsonb_populate_recordset.
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
  v_row jsonb;
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

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' OR NULLIF(v_row->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Restore payload for % contains a row without an id.', p_table::text;
    END IF;

    v_row := jsonb_set(v_row, '{farm_id}', to_jsonb(p_farm_id), true);

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s WHERE id = (($1->>''id'')::uuid) AND farm_id <> $2)',
      p_table
    ) INTO v_has_conflict USING v_row, p_farm_id;
    IF v_has_conflict THEN
      RAISE EXCEPTION 'Restore rejected for %: payload contains an id owned by another farm.', p_table::text;
    END IF;

    SELECT
      string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
      string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum)
        FILTER (WHERE a.attname NOT IN ('id', 'farm_id'))
    INTO v_columns, v_update_columns
    FROM pg_attribute a
    WHERE a.attrelid = p_table
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (v_row ? a.attname OR a.attname = 'farm_id');

    IF v_columns IS NULL OR v_update_columns IS NULL THEN
      RAISE EXCEPTION 'Restore failed for %: no insertable/updateable columns found.', p_table::text;
    END IF;

    EXECUTE format(
      'INSERT INTO %s (%s)
       SELECT %s FROM jsonb_populate_record(NULL::%s, $1)
       ON CONFLICT (id) DO UPDATE SET %s',
      p_table, v_columns, v_columns, p_table, v_update_columns
    ) USING v_row;

    v_rows_affected := v_rows_affected + 1;
  END LOOP;

  RETURN v_rows_affected;
END;
$$;

CREATE OR REPLACE FUNCTION public._restore_table_for_farm_with_conflict(
  p_table regclass,
  p_rows jsonb,
  p_farm_id uuid,
  p_conflict_columns text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row jsonb;
  v_columns text;
  v_update_columns text;
  v_conflict_columns text;
  v_missing_conflict_column boolean;
  v_has_conflict boolean;
  v_rows_affected integer := 0;
BEGIN
  IF p_rows IS NULL OR p_rows = 'null'::jsonb THEN
    RETURN 0;
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Restore payload for % must be a JSON array.', p_table::text;
  END IF;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinality)
  INTO v_conflict_columns
  FROM unnest(p_conflict_columns) WITH ORDINALITY AS c(column_name, ordinality);

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' OR NULLIF(v_row->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Restore payload for % contains a row without an id.', p_table::text;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM unnest(p_conflict_columns) AS c(column_name)
      WHERE NOT (v_row ? c.column_name)
    ) INTO v_missing_conflict_column;
    IF v_missing_conflict_column THEN
      RAISE EXCEPTION 'Restore payload for % is missing a conflict-key column.', p_table::text;
    END IF;

    v_row := jsonb_set(v_row, '{farm_id}', to_jsonb(p_farm_id), true);

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s WHERE id = (($1->>''id'')::uuid) AND farm_id <> $2)',
      p_table
    ) INTO v_has_conflict USING v_row, p_farm_id;
    IF v_has_conflict THEN
      RAISE EXCEPTION 'Restore rejected for %: payload contains an id owned by another farm.', p_table::text;
    END IF;

    SELECT
      string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
      string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum)
        FILTER (
          WHERE a.attname NOT IN ('id', 'farm_id')
            AND a.attname <> ALL(p_conflict_columns)
        )
    INTO v_columns, v_update_columns
    FROM pg_attribute a
    WHERE a.attrelid = p_table
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (v_row ? a.attname OR a.attname = 'farm_id');

    IF v_columns IS NULL OR v_update_columns IS NULL OR v_conflict_columns IS NULL THEN
      RAISE EXCEPTION 'Restore failed for %: no insertable/updateable columns found.', p_table::text;
    END IF;

    EXECUTE format(
      'INSERT INTO %s (%s)
       SELECT %s FROM jsonb_populate_record(NULL::%s, $1)
       ON CONFLICT (%s) DO UPDATE SET %s',
      p_table, v_columns, v_columns, p_table, v_conflict_columns, v_update_columns
    ) USING v_row;

    v_rows_affected := v_rows_affected + 1;
  END LOOP;

  RETURN v_rows_affected;
END;
$$;

REVOKE ALL ON FUNCTION public._restore_table_for_farm(regclass, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._restore_table_for_farm_with_conflict(regclass, jsonb, uuid, text[])
  FROM PUBLIC, anon, authenticated;

-- Preserve the existing public entry point permissions. The function itself
-- continues to derive the authoritative farm from auth.uid().
REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer)
  TO authenticated, service_role;

COMMIT;
