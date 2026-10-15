BEGIN;

-- Review-08 owner decisions (not applied to any live database by this change):
--   * Only a farm owner or admin may call restore_farm_backup. Workers may
--     still download backups. Existing profiles default to owner so current
--     single-user farms keep restore. Clients cannot update farm_role.
--   * This function raises its own statement_timeout to 120s. The setting is
--     restored when the function exits.
--   * A pre-season reset undo (payload _pre_season_reset = true) soft-deletes
--     live rows in the listed collections that are not in the snapshot.
--     Ordinary restores do not do that.
-- The body below is the 20261013180000 definition plus those guards.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS farm_role text NOT NULL DEFAULT 'owner';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_farm_role_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_farm_role_valid
  CHECK (farm_role IN ('owner', 'admin', 'worker'));

COMMENT ON COLUMN public.profiles.farm_role IS
  'owner, admin, or worker. Clients cannot update this column. Only owner and admin may restore a backup. Existing profiles default to owner.';

REVOKE UPDATE (farm_role) ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.restore_farm_backup(
  p_payload jsonb,
  p_active_season integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '120s'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
  v_farm_role text;
  v_result jsonb;
  v_schedules jsonb := p_payload->'maintenance_schedules';
  v_grain jsonb := p_payload->'grain_movements';
  v_work_requests jsonb := p_payload->'work_requests';
  v_schedule_conflicts integer := 0;
  v_grain_conflicts integer := 0;
  v_work_request_conflicts integer := 0;
  v_expected_active_season integer;
  v_updated integer;
  v_rollback_table text;
  v_pre_season_reset boolean := COALESCE(p_payload->>'_pre_season_reset', '') = 'true';
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT farm_id, farm_role
  INTO v_farm_id, v_farm_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.';
  END IF;

  IF v_farm_role IS DISTINCT FROM 'owner' AND v_farm_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only the farm owner or an admin can restore a backup.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Restore payload must be a JSON object.';
  END IF;

  IF v_pre_season_reset AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_payload->'_rollback_tables', '[]'::jsonb)) AS item
    WHERE item NOT IN (
      'fields',
      'bins',
      'plant_records',
      'spray_records',
      'harvest_records',
      'hay_harvest_records',
      'custom_spray_records',
      'fertilizer_applications',
      'tillage_records',
      'grain_movements',
      'saved_seeds',
      'fertilizer_recipes',
      'spray_recipes',
      'work_requests',
      'equipment',
      'maintenance_schedules',
      'maintenance_logs',
      'fsa_tract_imports',
      'field_clu_assignments'
    )
  ) THEN
    RAISE EXCEPTION 'Unknown pre-season rollback table.'
      USING ERRCODE = '22023';
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

  -- Pre-season undo only. Soft-delete live rows the snapshot does not contain.
  -- FSA and CLU match their restore conflict keys so a resurrected row with a
  -- different id is not hidden again.
  IF v_pre_season_reset THEN
    FOR v_rollback_table IN
      SELECT item
      FROM jsonb_array_elements_text(COALESCE(p_payload->'_rollback_tables', '[]'::jsonb)) AS item
    LOOP
      IF v_rollback_table = 'fsa_tract_imports' THEN
        UPDATE public.fsa_tract_imports AS target
        SET deleted_at = COALESCE(target.deleted_at, now())
        WHERE target.farm_id = v_farm_id
          AND target.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p_payload->'fsa_tract_imports', '[]'::jsonb)) AS item
            WHERE item->>'tract_key' = target.tract_key
          );
      ELSIF v_rollback_table = 'field_clu_assignments' THEN
        UPDATE public.field_clu_assignments AS target
        SET deleted_at = COALESCE(target.deleted_at, now())
        WHERE target.farm_id = v_farm_id
          AND target.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p_payload->'field_clu_assignments', '[]'::jsonb)) AS item
            WHERE item->>'tract_key' = target.tract_key
              AND item->>'clu_number' = target.clu_number
          );
      ELSE
        EXECUTE format(
          $sql$
          UPDATE public.%I AS target
          SET deleted_at = COALESCE(target.deleted_at, now())
          WHERE target.farm_id = $1
            AND target.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE($2, '[]'::jsonb)) AS item
              WHERE item->>'id' = target.id::text
            )
          $sql$,
          v_rollback_table
        ) USING v_farm_id, p_payload -> v_rollback_table;
      END IF;
    END LOOP;
  END IF;

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

ALTER FUNCTION public.restore_farm_backup(jsonb, integer) SET statement_timeout = '120s';

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;

COMMIT;
