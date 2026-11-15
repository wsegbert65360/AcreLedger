BEGIN;

-- Extend the paid customer-restore entry point without changing the private
-- core used by free pre-season undo. Cattle is continuous state, like
-- equipment; ordinary uploaded backups restore it parent-before-child.
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

  -- A live group not present in the payload keeps its name. A conflicting
  -- restored group remains a tombstone so the rest of the backup can restore.
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
          THEN jsonb_set(item, '{deleted_at}', to_jsonb(now()), true)
          ELSE item
        END
        ORDER BY ord
      ), '[]'::jsonb),
      count(*) FILTER (WHERE conflicts)
    INTO v_groups, v_group_name_conflicts
    FROM marked;
  END IF;

  v_result := public._restore_farm_backup_impl(p_payload, p_active_season);
  v_result := v_result || jsonb_build_object(
    'cattle_groups', public._restore_table_for_farm('public.cattle_groups'::regclass, v_groups, v_farm_id),
    'cattle_moves', public._restore_table_for_farm('public.cattle_moves'::regclass, p_payload->'cattle_moves', v_farm_id),
    'cattle_events', public._restore_table_for_farm('public.cattle_events'::regclass, p_payload->'cattle_events', v_farm_id),
    'cattle_group_name_conflicts', v_group_name_conflicts
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated, service_role;

-- RLS hides tombstones during zero-row replay reconciliation. Keep the fixed
-- table allowlist and add only the directly queued cattle parent table.
CREATE OR REPLACE FUNCTION public.get_offline_sync_row_state(
  p_table_name text,
  p_row_id uuid,
  p_farm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_row jsonb;
BEGIN
  IF p_table_name NOT IN (
    'fields', 'bins', 'plant_records', 'spray_records',
    'harvest_records', 'hay_harvest_records', 'custom_spray_records',
    'fertilizer_applications', 'tillage_records', 'grain_movements',
    'saved_seeds', 'fertilizer_recipes', 'spray_recipes',
    'fsa_tract_imports', 'field_clu_assignments', 'work_requests',
    'equipment', 'maintenance_schedules', 'maintenance_logs',
    'cattle_groups'
  ) THEN
    RAISE EXCEPTION 'Unsupported offline sync table' USING ERRCODE = '22023';
  END IF;

  IF current_user <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    SELECT farm_id INTO v_user_farm_id
    FROM public.profiles
    WHERE id = auth.uid();
    IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
      RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  EXECUTE format(
    'SELECT to_jsonb(row_value) FROM public.%I AS row_value WHERE id = $1 AND farm_id = $2',
    p_table_name
  ) INTO v_row USING p_row_id, p_farm_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid)
  TO authenticated, service_role;

COMMIT;
