BEGIN;

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
  v_temp_table text := format('tmp_restore_%s', replace(gen_random_uuid()::text, '-', ''));
  v_columns text;
  v_update_columns text;
  v_conflict_columns text;
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

  SELECT string_agg(format('%I', column_name), ', ')
  INTO v_conflict_columns
  FROM unnest(p_conflict_columns) AS c(column_name);

  SELECT
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
    string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum)
      FILTER (WHERE a.attname <> 'id' AND a.attname <> ALL(p_conflict_columns))
  INTO v_columns, v_update_columns
  FROM pg_attribute a
  WHERE a.attrelid = p_table
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_columns IS NULL OR v_update_columns IS NULL OR v_conflict_columns IS NULL THEN
    RAISE EXCEPTION 'Restore failed for %: no insertable/updateable columns found.', p_table::text;
  END IF;

  EXECUTE format(
    'INSERT INTO %s (%s)
     SELECT %s FROM %I
     ON CONFLICT (%s)
     DO UPDATE SET %s',
    p_table,
    v_columns,
    v_columns,
    v_temp_table,
    v_conflict_columns,
    v_update_columns
  );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;
END;
$$;

REVOKE ALL ON FUNCTION public._restore_table_for_farm_with_conflict(regclass, jsonb, uuid, text[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.restore_farm_backup(
  p_payload jsonb,
  p_active_season integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT farm_id
  INTO v_farm_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Restore payload must be a JSON object.';
  END IF;

  v_result := jsonb_build_object(
    'fields',                  public._restore_table_for_farm('public.fields'::regclass, p_payload->'fields', v_farm_id),
    'bins',                    public._restore_table_for_farm('public.bins'::regclass, p_payload->'bins', v_farm_id),
    'plant_records',           public._restore_table_for_farm('public.plant_records'::regclass, p_payload->'plant_records', v_farm_id),
    'spray_records',           public._restore_table_for_farm('public.spray_records'::regclass, p_payload->'spray_records', v_farm_id),
    'harvest_records',         public._restore_table_for_farm('public.harvest_records'::regclass, p_payload->'harvest_records', v_farm_id),
    'hay_harvest_records',     public._restore_table_for_farm('public.hay_harvest_records'::regclass, p_payload->'hay_harvest_records', v_farm_id),
    'fertilizer_applications', public._restore_table_for_farm('public.fertilizer_applications'::regclass, p_payload->'fertilizer_applications', v_farm_id),
    'tillage_records',         public._restore_table_for_farm('public.tillage_records'::regclass, p_payload->'tillage_records', v_farm_id),
    'grain_movements',         public._restore_table_for_farm('public.grain_movements'::regclass, p_payload->'grain_movements', v_farm_id),
    'saved_seeds',             public._restore_table_for_farm('public.saved_seeds'::regclass, p_payload->'saved_seeds', v_farm_id),
    'fertilizer_recipes',      public._restore_table_for_farm('public.fertilizer_recipes'::regclass, p_payload->'fertilizer_recipes', v_farm_id),
    'spray_recipes',           public._restore_table_for_farm('public.spray_recipes'::regclass, p_payload->'spray_recipes', v_farm_id),
    'fsa_tract_imports',       public._restore_table_for_farm_with_conflict('public.fsa_tract_imports'::regclass, p_payload->'fsa_tract_imports', v_farm_id, ARRAY['farm_id', 'tract_key']),
    'field_clu_assignments',   public._restore_table_for_farm_with_conflict('public.field_clu_assignments'::regclass, p_payload->'field_clu_assignments', v_farm_id, ARRAY['farm_id', 'tract_key', 'clu_number'])
  );

  IF p_active_season IS NOT NULL THEN
    UPDATE public.profiles
    SET active_season = p_active_season
    WHERE id = v_user_id;

    v_result := v_result || jsonb_build_object('active_season', p_active_season);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;

COMMIT;
