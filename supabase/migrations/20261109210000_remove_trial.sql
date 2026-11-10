-- Free tier: there is no trial. Every new farm starts on the free record book regardless of
-- entitlements_mode(), and a farm's stored trial_ends_at no longer grants any access.
-- Nothing is deleted: trial columns and trial_claims stay (history), they just stop mattering.
-- Existing farms that still carry a future trial_ends_at (owner/test farms) resolve to 'free'
-- unless they are complimentary or paid. Clear their trial_ends_at by hand in production if wanted.

CREATE OR REPLACE FUNCTION public.ensure_user_farm()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT farm_id
  INTO v_farm_id
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for current user.';
  END IF;

  IF v_farm_id IS NULL THEN
    INSERT INTO public.farms (name)
    VALUES ('My Farm')
    RETURNING id INTO v_farm_id;

    UPDATE public.profiles
    SET farm_id = v_farm_id,
        active_season = COALESCE(active_season, EXTRACT(YEAR FROM now())::int)
    WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET active_season = EXTRACT(YEAR FROM now())::int
    WHERE id = v_user_id AND active_season IS NULL;
  END IF;

  RETURN v_farm_id;
END;
$$;

ALTER FUNCTION public.ensure_user_farm() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_user_farm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_farm() TO authenticated;

-- Plan resolution without the legacy_trial plan.
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