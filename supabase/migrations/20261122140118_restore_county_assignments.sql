BEGIN;

-- Review 2026-11-21 #16. County assignments, including a farmer's manual
-- county splits, were not in the JSON backup or the restore. Same body as
-- 20261115130000 plus a county_assignments block after the other tables.
-- Never edits the committed migration.

CREATE OR REPLACE FUNCTION public.restore_farm_backup(
  p_payload jsonb,
  p_active_season integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_farm_id uuid;
  v_result jsonb;
  v_groups jsonb := p_payload->'cattle_groups';
  v_group_name_conflicts integer := 0;
  v_counties jsonb := p_payload->'county_assignments';
  v_county_conflicts integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_farm_id
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_premium(v_farm_id, 'backup_restore');
  PERFORM set_config('acreledger.restoring', 'on', true);
  PERFORM set_config('acreledger.cattle_rpc', 'on', true);

  -- A live group that is not in the payload keeps its name; an active restored
  -- group whose name collides with it is renamed with a suffix.
  IF jsonb_typeof(v_groups) = 'array' THEN
    WITH payload AS (
      SELECT item, ord
      FROM jsonb_array_elements(v_groups) WITH ORDINALITY AS t(item, ord)
    ),
    marked AS (
      SELECT
        item,
        ord,
        (item->>'deleted_at') IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.cattle_groups g
          WHERE g.farm_id = v_farm_id
            AND g.deleted_at IS NULL
            AND lower(btrim(g.name)) = lower(btrim(item->>'name'))
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
          THEN jsonb_set(
            item, '{name}',
            to_jsonb(public._cattle_restore_group_name(v_farm_id, item->>'name', p_payload->'cattle_groups')),
            true
          )
          ELSE item
        END
        ORDER BY ord
      ), '[]'::jsonb),
      count(*) FILTER (WHERE conflicts)
    INTO v_groups, v_group_name_conflicts
    FROM marked;
  END IF;

  v_result := public._restore_farm_backup_impl(p_payload, p_active_season);

  -- Park the name of every live group the payload is about to rewrite. Rows are
  -- upserted one at a time, so without this a name that moved from one payload
  -- group to another since the backup (old "Cows" deleted, "Heifers" renamed
  -- "Cows") hits the live-name unique index and aborts the whole farm restore.
  IF jsonb_typeof(v_groups) = 'array' THEN
    UPDATE public.cattle_groups g
    SET name = '__restoring__' || g.id::text
    WHERE g.farm_id = v_farm_id
      AND g.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_groups) AS t(item)
        WHERE item->>'id' = g.id::text
          AND item ? 'name'
      );
  END IF;
  v_result := v_result || jsonb_build_object(
    'cattle_groups', public._restore_table_for_farm('public.cattle_groups'::regclass, v_groups, v_farm_id),
    'cattle_moves', public._restore_table_for_farm('public.cattle_moves'::regclass, p_payload->'cattle_moves', v_farm_id),
    'cattle_events', public._restore_table_for_farm('public.cattle_events'::regclass, p_payload->'cattle_events', v_farm_id),
    'cattle_group_name_conflicts', v_group_name_conflicts
  );

  -- County assignments (manual county splits included). Restored after the
  -- fields they reference. A live row for the same subject and county under a
  -- different id would hit county_assignments_live_unique and abort the whole
  -- restore, so it is retired first; the backup's row replaces it.
  IF jsonb_typeof(v_counties) = 'array' THEN
    WITH incoming AS (
      SELECT item->>'id' AS id, item->>'subject_type' AS subject_type, item->>'subject_key' AS subject_key,
             coalesce(item->>'county_fips', 'unresolved') AS county
      FROM jsonb_array_elements(v_counties) AS t(item)
      WHERE (item->>'deleted_at') IS NULL
    ),
    retired AS (
      UPDATE public.county_assignments c
      SET deleted_at = now()
      FROM incoming i
      WHERE c.farm_id = v_farm_id
        AND c.deleted_at IS NULL
        AND c.subject_type = i.subject_type
        AND c.subject_key = i.subject_key
        AND coalesce(c.county_fips, 'unresolved') = i.county
        AND c.id::text IS DISTINCT FROM i.id
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_counties) AS p(item) WHERE p.item->>'id' = c.id::text)
      RETURNING c.id
    )
    SELECT count(*) INTO v_county_conflicts FROM retired;
  END IF;
  v_result := v_result || jsonb_build_object(
    'county_assignments', public._restore_table_for_farm('public.county_assignments'::regclass, v_counties, v_farm_id),
    'county_assignment_conflicts', v_county_conflicts
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated, service_role;

COMMIT;
