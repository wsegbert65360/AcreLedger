BEGIN;

-- Backup restore resurrects rows (the client sends deleted_at: null). Two unique
-- indexes abort the whole restore transaction when a payload row collides with a
-- live row the payload does not itself restore:
--   * idx_grain_movements_one_active_per_harvest (one live grain movement per harvest)
--   * work_requests_request_number_unique (farm_id, request_number) — this UNIQUE
--     is not partial, so a tombstone with the same number still collides.
-- Choice: the live (or already-stored) row wins. A colliding grain payload row
-- is restored as a tombstone (deleted_at = now()). A colliding work-request
-- payload row is restored as a tombstone and its request_number is suffixed so
-- UNIQUE still holds. Conflicts are counted in the RPC result so the client can
-- tell the farmer. Same live-row-wins choice as maintenance_schedules in
-- 20261009024113. Signature, grants, SECURITY DEFINER, and search_path stay as
-- in that migration. Optional p_payload._expected_active_season is a
-- compare-and-set guard when the client also asks to switch active season.
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
  v_schedules jsonb := p_payload->'maintenance_schedules';
  v_grain jsonb := p_payload->'grain_movements';
  v_work_requests jsonb := p_payload->'work_requests';
  v_schedule_conflicts integer := 0;
  v_grain_conflicts integer := 0;
  v_work_request_conflicts integer := 0;
  v_expected_active_season integer;
  v_updated integer;
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

  -- Preserve the database-side active-season guard from
  -- 20260716021120_protect_active_season.sql. This SECURITY DEFINER function
  -- must validate independently of the client before restoring any rows.
  IF p_active_season IS NOT NULL AND (
    p_active_season < 2000
    OR p_active_season > EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1
  ) THEN
    RAISE EXCEPTION 'Invalid active season: %. Must be between 2000 and %.',
      p_active_season,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1
      USING ERRCODE = '22023';
  END IF;

  -- Equipment meter columns are normally writable only through the dedicated
  -- RPCs. Backup restore is another trusted, transactional path and must be
  -- able to replace a newer reading/unit with the saved snapshot.
  PERFORM set_config('acreledger.equipment_rpc', 'on', true);

  -- A payload task stays deleted when a live task that the payload does not
  -- itself restore already owns the same name on the same machine. Live tasks
  -- that are also in the payload take the payload's name, so they are not
  -- treated as conflicts.
  IF jsonb_typeof(v_schedules) = 'array' THEN
    WITH payload AS (
      SELECT
        item,
        ord,
        EXISTS (
          SELECT 1 FROM public.maintenance_schedules s
          WHERE s.farm_id = v_farm_id
            AND s.id::text = item->>'id'
            AND s.deleted_at IS NULL
        ) AS live_now
      FROM jsonb_array_elements(v_schedules) WITH ORDINALITY AS t(item, ord)
    ),
    marked AS (
      SELECT
        item,
        ord,
        live_now,
        (item->>'deleted_at') IS NULL AND EXISTS (
          SELECT 1
          FROM public.maintenance_schedules s
          WHERE s.farm_id = v_farm_id
            AND s.deleted_at IS NULL
            AND s.equipment_id::text = item->>'equipment_id'
            AND lower(btrim(s.task_name)) = lower(btrim(item->>'task_name'))
            AND s.id::text IS DISTINCT FROM item->>'id'
            AND NOT EXISTS (
              SELECT 1 FROM payload other WHERE other.item->>'id' = s.id::text
            )
        ) AS conflicts
      FROM payload
    )
    SELECT
      COALESCE(jsonb_agg(
        CASE WHEN conflicts
          THEN jsonb_set(item, '{deleted_at}', to_jsonb(now()), true)
          ELSE item
        END
        ORDER BY live_now DESC, ord
      ), '[]'::jsonb),
      count(*) FILTER (WHERE conflicts)
    INTO v_schedules, v_schedule_conflicts
    FROM marked;
  END IF;

  -- Live grain movement for a harvest wins when the payload would restore a
  -- second active row for the same harvest_record_id.
  IF jsonb_typeof(v_grain) = 'array' THEN
    WITH payload AS (
      SELECT item, ord
      FROM jsonb_array_elements(v_grain) WITH ORDINALITY AS t(item, ord)
    ),
    marked AS (
      SELECT
        item,
        ord,
        (item->>'deleted_at') IS NULL
        AND NULLIF(item->>'harvest_record_id', '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.grain_movements g
          WHERE g.farm_id = v_farm_id
            AND g.deleted_at IS NULL
            AND g.harvest_record_id::text = item->>'harvest_record_id'
            AND g.id::text IS DISTINCT FROM item->>'id'
            AND NOT EXISTS (
              SELECT 1 FROM payload other WHERE other.item->>'id' = g.id::text
            )
        ) AS conflicts
      FROM payload
    )
    SELECT
      COALESCE(jsonb_agg(
        CASE WHEN conflicts
          THEN jsonb_set(item, '{deleted_at}', to_jsonb(now()), true)
          ELSE item
        END
        ORDER BY ord
      ), '[]'::jsonb),
      count(*) FILTER (WHERE conflicts)
    INTO v_grain, v_grain_conflicts
    FROM marked;
  END IF;

  -- Any stored work request number wins when the payload would restore a
  -- second row for UNIQUE(farm_id, request_number), including tombstones.
  IF jsonb_typeof(v_work_requests) = 'array' THEN
    WITH payload AS (
      SELECT item, ord
      FROM jsonb_array_elements(v_work_requests) WITH ORDINALITY AS t(item, ord)
    ),
    marked AS (
      SELECT
        item,
        ord,
        NULLIF(item->>'request_number', '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.work_requests w
          WHERE w.farm_id = v_farm_id
            AND w.request_number = item->>'request_number'
            AND w.id::text IS DISTINCT FROM item->>'id'
            AND NOT EXISTS (
              SELECT 1 FROM payload other WHERE other.item->>'id' = w.id::text
            )
        ) AS conflicts
      FROM payload
    )
    SELECT
      COALESCE(jsonb_agg(
        CASE WHEN conflicts
          THEN jsonb_set(
            jsonb_set(item, '{deleted_at}', to_jsonb(now()), true),
            '{request_number}',
            to_jsonb((item->>'request_number') || '-restore-conflict-' || left(coalesce(item->>'id', ''), 8)),
            true
          )
          ELSE item
        END
        ORDER BY ord
      ), '[]'::jsonb),
      count(*) FILTER (WHERE conflicts)
    INTO v_work_requests, v_work_request_conflicts
    FROM marked;
  END IF;

  v_result := jsonb_build_object(
    'fields',                  public._restore_table_for_farm('public.fields'::regclass, p_payload->'fields', v_farm_id),
    'bins',                    public._restore_table_for_farm('public.bins'::regclass, p_payload->'bins', v_farm_id),
    'plant_records',           public._restore_table_for_farm('public.plant_records'::regclass, p_payload->'plant_records', v_farm_id),
    'spray_records',           public._restore_table_for_farm('public.spray_records'::regclass, p_payload->'spray_records', v_farm_id),
    'harvest_records',         public._restore_table_for_farm('public.harvest_records'::regclass, p_payload->'harvest_records', v_farm_id),
    'hay_harvest_records',     public._restore_table_for_farm('public.hay_harvest_records'::regclass, p_payload->'hay_harvest_records', v_farm_id),
    'custom_spray_records',    public._restore_table_for_farm('public.custom_spray_records'::regclass, p_payload->'custom_spray_records', v_farm_id),
    'fertilizer_applications', public._restore_table_for_farm('public.fertilizer_applications'::regclass, p_payload->'fertilizer_applications', v_farm_id),
    'tillage_records',         public._restore_table_for_farm('public.tillage_records'::regclass, p_payload->'tillage_records', v_farm_id),
    'grain_movements',         public._restore_table_for_farm('public.grain_movements'::regclass, v_grain, v_farm_id),
    'saved_seeds',             public._restore_table_for_farm('public.saved_seeds'::regclass, p_payload->'saved_seeds', v_farm_id),
    'fertilizer_recipes',      public._restore_table_for_farm('public.fertilizer_recipes'::regclass, p_payload->'fertilizer_recipes', v_farm_id),
    'spray_recipes',           public._restore_table_for_farm('public.spray_recipes'::regclass, p_payload->'spray_recipes', v_farm_id),
    'work_requests',           public._restore_table_for_farm('public.work_requests'::regclass, v_work_requests, v_farm_id),
    'equipment',               public._restore_table_for_farm('public.equipment'::regclass, p_payload->'equipment', v_farm_id),
    'maintenance_schedules',   public._restore_table_for_farm('public.maintenance_schedules'::regclass, v_schedules, v_farm_id),
    'maintenance_logs',        public._restore_table_for_farm('public.maintenance_logs'::regclass, p_payload->'maintenance_logs', v_farm_id),
    'fsa_tract_imports',       public._restore_table_for_farm_with_conflict('public.fsa_tract_imports'::regclass, p_payload->'fsa_tract_imports', v_farm_id, ARRAY['farm_id', 'tract_key']),
    'field_clu_assignments',   public._restore_table_for_farm_with_conflict('public.field_clu_assignments'::regclass, p_payload->'field_clu_assignments', v_farm_id, ARRAY['farm_id', 'tract_key', 'clu_number'])
  );

  v_result := v_result || jsonb_build_object(
    'maintenance_schedule_name_conflicts', v_schedule_conflicts,
    'grain_harvest_link_conflicts', v_grain_conflicts,
    'work_request_number_conflicts', v_work_request_conflicts
  );

  IF p_active_season IS NOT NULL THEN
    v_expected_active_season := NULLIF(p_payload->>'_expected_active_season', '')::integer;
    UPDATE public.profiles
    SET active_season = p_active_season
    WHERE id = v_user_id
      AND (v_expected_active_season IS NULL OR active_season = v_expected_active_season);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Active season changed elsewhere'
        USING ERRCODE = '22023';
    END IF;

    v_result := v_result || jsonb_build_object('active_season', p_active_season);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;

COMMIT;
