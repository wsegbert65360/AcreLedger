-- Entitlements hardening. No rows are deleted or rewritten.
--
-- entitlements_mode() and entitlement_free_limits() are internal. Every caller
-- in this repo is a SECURITY DEFINER function (farm_entitlement, assert_premium,
-- _farm_entitlement, rainfall collectors, field and paid-feature guards). Those
-- run as the owning superuser, so they keep working after EXECUTE is revoked
-- from PUBLIC, anon, and authenticated. Client code calls farm_entitlement and
-- assert_premium only, never these two. service_role may call them directly.
--
-- assert_premium accepts only the feature names actually passed by callers,
-- plus field_cap and rainfall (those guards raise the same names themselves).
-- Anything else is invalid_parameter_value (22023) before a shadow-log insert.
-- Shadow mode writes at most one row per (farm_id, feature) per minute.
--
-- Photos are gone from the product. Drop the spray_records photo-cap triggers
-- and guard_photo_cap(). spray_records rows stay. photo_cap stays in the
-- entitlement_free_limits() / _farm_entitlement() return types (signature
-- stability) and is NULL. _farm_entitlement() is not replaced: the
-- 20261110160000 plan rules (trialing is not paid; 14-day past_due grace)
-- remain, and a free plan reads photo_cap from entitlement_free_limits().

CREATE OR REPLACE FUNCTION public.entitlement_free_limits()
RETURNS TABLE (field_cap int, rainfall_slot_cap int, photo_cap int, history_seasons int, device_cap int)
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$ SELECT 50 AS field_cap, 2 AS rainfall_slot_cap, NULL::int AS photo_cap, 2 AS history_seasons, 1 AS device_cap $$;

REVOKE ALL ON FUNCTION public.entitlement_free_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entitlement_free_limits() TO service_role;

REVOKE ALL ON FUNCTION public.entitlements_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entitlements_mode() TO service_role;

CREATE OR REPLACE FUNCTION public.assert_premium(p_farm_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text;
  v_plan text;
BEGIN
  -- Fixed allowlist. Checked before mode, membership, and any shadow insert
  -- so a caller cannot fill entitlement_shadow_log with arbitrary names.
  IF p_feature IS NULL OR p_feature NOT IN (
    'reports', 'grain', 'equipment', 'landlord_split', 'fsa_tract',
    'backup_restore', 'field_cap', 'rainfall'
  ) THEN
    RAISE EXCEPTION 'invalid feature name' USING ERRCODE = '22023';
  END IF;

  v_mode := public.entitlements_mode();
  IF v_mode = 'off' THEN RETURN; END IF;
  -- Authenticated callers must belong to the farm; service_role/internal callers have no uid.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.farm_id = p_farm_id
  ) THEN
    RAISE EXCEPTION 'not a member of this farm' USING ERRCODE = '42501';
  END IF;
  SELECT e.plan INTO v_plan FROM public._farm_entitlement(p_farm_id) e;
  IF v_plan <> 'free' THEN RETURN; END IF;
  IF v_mode = 'shadow' THEN
    INSERT INTO public.entitlement_shadow_log (farm_id, feature, plan, user_id)
    SELECT p_farm_id, p_feature, v_plan, auth.uid()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.entitlement_shadow_log l
      WHERE l.farm_id = p_farm_id
        AND l.feature = p_feature
        AND l.created_at > pg_catalog.now() - interval '1 minute'
    );
    RETURN;
  END IF;
  RAISE EXCEPTION 'premium_required:%', p_feature USING ERRCODE = 'P0402';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_premium(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_premium(uuid, text) TO authenticated, service_role;

DROP TRIGGER IF EXISTS guard_photo_cap_insert ON public.spray_records;
DROP TRIGGER IF EXISTS guard_photo_cap_update ON public.spray_records;
DROP FUNCTION IF EXISTS public.guard_photo_cap();
