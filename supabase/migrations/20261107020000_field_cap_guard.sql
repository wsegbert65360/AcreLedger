-- Free tier, Phase 3: field cap. Server-enforced, grandfathering existing data.
-- Only NEW or REACTIVATED active fields are refused once a free farm is at its cap.
-- Existing fields stay editable; nothing is deleted or hidden. No-op while mode = 'off'.

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
  PERFORM pg_advisory_xact_lock(hashtext('field_cap:' || p_farm_id::text));
  SELECT count(*)::int INTO v_count FROM public.fields f
  WHERE f.farm_id = p_farm_id AND f.deleted_at IS NULL;
  IF v_count < v_cap THEN RETURN; END IF;
  IF v_mode = 'shadow' THEN
    INSERT INTO public.entitlement_shadow_log (farm_id, feature, plan, user_id)
    VALUES (p_farm_id, 'field_cap', v_plan, auth.uid());
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
BEGIN
  IF NEW.deleted_at IS NULL AND NEW.farm_id IS NOT NULL THEN
    PERFORM public.assert_field_capacity(NEW.farm_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_field_cap() FROM PUBLIC, anon, authenticated;

-- New active field.
DROP TRIGGER IF EXISTS guard_field_cap_insert ON public.fields;
CREATE TRIGGER guard_field_cap_insert BEFORE INSERT ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.guard_field_cap();

-- Reactivation of a soft-deleted field counts as a new active field.
DROP TRIGGER IF EXISTS guard_field_cap_reactivate ON public.fields;
CREATE TRIGGER guard_field_cap_reactivate BEFORE UPDATE OF deleted_at ON public.fields
  FOR EACH ROW WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.guard_field_cap();
