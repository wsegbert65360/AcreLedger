-- Free tier, Phase 1: entitlement core. No enforcement while mode = 'off' (default).
-- Server is the source of truth. Mirror constants in src/lib/entitlements.ts (a test checks they match).
-- Nothing here deletes or hides data.

-- ENTITLEMENTS_MODE: off | shadow | enforce. Service-role managed singleton row.
CREATE TABLE IF NOT EXISTS public.entitlement_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'shadow', 'enforce')),
  device_limit_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.entitlement_config (singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE public.entitlement_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entitlement_config FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.entitlement_config TO service_role;

-- What shadow mode would have blocked. Service-role read only.
CREATE TABLE IF NOT EXISTS public.entitlement_shadow_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  farm_id uuid NOT NULL,
  feature text NOT NULL,
  plan text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entitlement_shadow_log_farm_feature_idx
  ON public.entitlement_shadow_log (farm_id, feature, created_at DESC);
ALTER TABLE public.entitlement_shadow_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entitlement_shadow_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.entitlement_shadow_log TO service_role;

-- Free-tier limits: the single SQL source of truth. NULL = unlimited.
CREATE OR REPLACE FUNCTION public.entitlement_free_limits()
RETURNS TABLE (field_cap int, rainfall_slot_cap int, photo_cap int, history_seasons int, device_cap int)
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$ SELECT 50 AS field_cap, 2 AS rainfall_slot_cap, 20 AS photo_cap, 2 AS history_seasons, 1 AS device_cap $$;

CREATE OR REPLACE FUNCTION public.entitlements_mode()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$ SELECT coalesce((SELECT c.mode FROM public.entitlement_config c WHERE c.singleton), 'off') $$;

-- Internal: plan resolution with no membership check. Not granted to clients.
CREATE OR REPLACE FUNCTION public._farm_entitlement(p_farm_id uuid)
RETURNS TABLE (plan text, premium_until timestamptz, field_cap int, rainfall_slot_cap int,
               photo_cap int, history_seasons int, device_cap int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text := 'free';
  v_until timestamptz := NULL;
  v_comp_expires timestamptz;
  v_comped boolean := false;
  v_sub record;
  v_trial timestamptz;
BEGIN
  SELECT true, fc.expires_at INTO v_comped, v_comp_expires
  FROM public.farm_comps fc
  WHERE fc.farm_id = p_farm_id AND fc.deleted_at IS NULL
    AND (fc.expires_at IS NULL OR fc.expires_at > now())
  ORDER BY fc.expires_at DESC NULLS FIRST, fc.id
  LIMIT 1;

  IF v_comped THEN
    v_plan := 'complimentary'; v_until := v_comp_expires;
  ELSE
    SELECT s.status, s.current_period_end INTO v_sub
    FROM public.farm_subscriptions s
    WHERE s.farm_id = p_farm_id AND s.deleted_at IS NULL;
    IF FOUND AND (
      v_sub.status IN ('active', 'trialing')
      OR (v_sub.status IN ('past_due', 'canceled') AND v_sub.current_period_end > now())
    ) THEN
      v_plan := 'paid'; v_until := v_sub.current_period_end;
    ELSE
      SELECT f.trial_ends_at INTO v_trial FROM public.farms f WHERE f.id = p_farm_id;
      IF v_trial IS NOT NULL AND v_trial > now() THEN
        v_plan := 'legacy_trial'; v_until := v_trial;
      END IF;
    END IF;
  END IF;

  IF v_plan = 'free' THEN
    RETURN QUERY SELECT v_plan, v_until, l.field_cap, l.rainfall_slot_cap, l.photo_cap, l.history_seasons, l.device_cap
      FROM public.entitlement_free_limits() l;
  ELSE
    RETURN QUERY SELECT v_plan, v_until, NULL::int, NULL::int, NULL::int, NULL::int, NULL::int;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._farm_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._farm_entitlement(uuid) TO service_role;

-- Client-callable: members read their own farm's entitlement. Other farms return no rows.
-- `enforced` is true only in enforce mode, so the client never locks features while mode is off/shadow.
CREATE OR REPLACE FUNCTION public.farm_entitlement(p_farm_id uuid)
RETURNS TABLE (plan text, premium_until timestamptz, field_cap int, rainfall_slot_cap int,
               photo_cap int, history_seasons int, device_cap int, enforced boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.plan, e.premium_until, e.field_cap, e.rainfall_slot_cap, e.photo_cap, e.history_seasons,
         e.device_cap, (public.entitlements_mode() = 'enforce')
  FROM public._farm_entitlement(p_farm_id) e
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.farm_id = p_farm_id)
$$;
REVOKE ALL ON FUNCTION public.farm_entitlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.farm_entitlement(uuid) TO authenticated, service_role;

-- Guard for paid-only writes. Raises P0402 'premium_required:<feature>' only in enforce mode.
CREATE OR REPLACE FUNCTION public.assert_premium(p_farm_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := public.entitlements_mode();
  v_plan text;
BEGIN
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
    VALUES (p_farm_id, p_feature, v_plan, auth.uid());
    RETURN;
  END IF;
  RAISE EXCEPTION 'premium_required:%', p_feature USING ERRCODE = 'P0402';
END;
$$;
REVOKE ALL ON FUNCTION public.assert_premium(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_premium(uuid, text) TO authenticated, service_role;

COMMENT ON TABLE public.entitlement_config IS 'Free tier mode flag (off|shadow|enforce) and device-limit flag. Default off. Service-role only.';
