-- Fixes from the 2026-11-12 batch review (a5ffd3b..d8abe71). No rows are deleted or rewritten.
--
-- 1. guard_field_cap and the pre-season undo.
--    _restore_table_for_farm writes with INSERT ... ON CONFLICT (id) DO UPDATE.
--    PostgreSQL runs BEFORE INSERT triggers on the proposed row before the
--    conflict becomes an update, so guard_field_cap counted a field that was
--    already stored as one more new field. A free farm holding 50 or more
--    fields (grandfathered, or added while paid or while the mode was off)
--    could not undo a pre-season reset in enforce mode.
--    The guard now skips a row that is not a new active field:
--      * an INSERT whose id is already an active field of the same farm. With
--        ON CONFLICT it becomes an update of that field. Without ON CONFLICT
--        it fails on the primary key. Neither adds a field.
--      * while acreledger.restoring is 'on', an INSERT or reactivation of a
--        field the farm already has stored (active or soft-deleted). Only
--        undo_pre_season_reset and restore_farm_backup set that
--        transaction-local flag, and PostgREST clients cannot set it. The undo
--        payload is built on the server, and its rollback step soft-deletes
--        fields added after the snapshot, so the farm ends with the fields it
--        held at the reset. A field id the farm has never stored still goes
--        through assert_field_capacity. This is not a bypass.
--
-- 2. assert_field_capacity shadow rows: at most one per farm per minute, the
--    same rule 20261110190000 gave assert_premium.
--
-- 3. get_field_rainfall_daily: a slot field whose lat/lng were cleared keeps
--    its slot (20261110170000). The read checked rainfall_slot_field_ids,
--    which leaves out fields without coordinates, so the client got
--    premium_required:rainfall for a field that holds a slot. The read now
--    checks the stored slot row. A soft-deleted field has no slot row.

CREATE OR REPLACE FUNCTION public.assert_field_capacity(p_farm_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := public.entitlements_mode();
  v_plan text;
  v_cap int;
  v_count int;
BEGIN
  IF v_mode = 'off' THEN RETURN; END IF;
  SELECT e.plan, e.field_cap INTO v_plan, v_cap FROM public._farm_entitlement(p_farm_id) e;
  IF v_cap IS NULL THEN RETURN; END IF;
  -- Serialize concurrent inserts for one farm so the cap cannot be raced past.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('field_cap:' || p_farm_id::text));
  SELECT count(*)::int INTO v_count FROM public.fields f
  WHERE f.farm_id = p_farm_id AND f.deleted_at IS NULL;
  IF v_count < v_cap THEN RETURN; END IF;
  IF v_mode = 'shadow' THEN
    INSERT INTO public.entitlement_shadow_log (farm_id, feature, plan, user_id)
    SELECT p_farm_id, 'field_cap', v_plan, auth.uid()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.entitlement_shadow_log l
      WHERE l.farm_id = p_farm_id
        AND l.feature = 'field_cap'
        AND l.created_at > pg_catalog.now() - interval '1 minute'
    );
    RETURN;
  END IF;
  RAISE EXCEPTION 'premium_required:field_cap' USING ERRCODE = 'P0402';
END;
$$;
REVOKE ALL ON FUNCTION public.assert_field_capacity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_field_capacity(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_field_cap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restoring boolean := pg_catalog.current_setting('acreledger.restoring', true) = 'on';
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.farm_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM public.fields f
      WHERE f.id = NEW.id
        AND f.farm_id = NEW.farm_id
        AND (f.deleted_at IS NULL OR v_restoring)
    ) THEN
      RETURN NEW;
    END IF;
  ELSIF v_restoring AND OLD.farm_id = NEW.farm_id THEN
    -- Reactivation of a stored field during a server restore.
    RETURN NEW;
  END IF;

  PERFORM public.assert_field_capacity(NEW.farm_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_field_cap() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_field_rainfall_daily(p_field_id uuid, p_start date, p_end date)
RETURNS TABLE (rain_date date, rainfall_in numeric, finalized boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_farm uuid;
BEGIN
  SELECT f.farm_id INTO v_farm
  FROM public.fields f
  JOIN public.profiles p ON p.farm_id = f.farm_id AND p.id = auth.uid()
  WHERE f.id = p_field_id;
  IF v_farm IS NULL THEN RETURN; END IF;

  -- The stored slot decides, with or without coordinates. A slot field with no
  -- lat/lng simply has no new rainfall until they return.
  IF public.entitlements_mode() = 'enforce'
     AND (SELECT e.plan FROM public._farm_entitlement(v_farm) e) = 'free'
     AND NOT EXISTS (
       SELECT 1
       FROM public.farm_rainfall_slots s
       JOIN public.fields f ON f.id = s.field_id AND f.farm_id = s.farm_id
       WHERE s.farm_id = v_farm
         AND s.field_id = p_field_id
         AND f.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'premium_required:rainfall' USING ERRCODE = 'P0402';
  END IF;

  RETURN QUERY
  SELECT d.rain_date, d.rainfall_in, d.finalized
  FROM public.field_rainfall_daily d
  WHERE d.field_id = p_field_id AND d.rain_date BETWEEN p_start AND p_end
  ORDER BY d.rain_date
  LIMIT 1100;
END;
$$;
REVOKE ALL ON FUNCTION public.get_field_rainfall_daily(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_field_rainfall_daily(uuid, date, date) TO authenticated, service_role;
