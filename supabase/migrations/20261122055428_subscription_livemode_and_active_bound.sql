-- Live-billing cutover safety.
--
-- 1. farm_subscriptions.livemode records whether Stripe created the row in
--    test or live mode (written only by the signed webhook). At the live flip,
--    test rows can be found and retired:
--      UPDATE public.farm_subscriptions SET deleted_at = now()
--      WHERE livemode IS NOT TRUE AND deleted_at IS NULL;   -- service role
-- 2. An `active` row keeps Pro only through current_period_end plus the same
--    14-day grace used for failed payments. Before, `active` granted Pro with
--    no end, so a row whose webhooks stop arriving (a test-mode subscription
--    after the switch to live keys, or a missed cancel) stayed Pro forever.
--    Stripe sends a renewal event at each period end, so a paid farm is never
--    near the bound. A NULL period end keeps the previous behaviour.
-- Matches getFarmBillingAccess in src/lib/billing.ts.

ALTER TABLE public.farm_subscriptions
  ADD COLUMN IF NOT EXISTS livemode boolean;

COMMENT ON COLUMN public.farm_subscriptions.livemode IS
  'Stripe livemode of the subscription, written by the signed webhook. NULL on rows from before 2026-11-21.';

-- Clients never write billing state (table writes were revoked in 20260917043144;
-- this keeps the new column out of any future column grant too).
REVOKE INSERT (livemode), UPDATE (livemode)
  ON public.farm_subscriptions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._farm_entitlement(p_farm_id uuid)
RETURNS TABLE (plan text, premium_until timestamptz, field_cap int, rainfall_slot_cap int,
               photo_cap int, history_seasons int, device_cap int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- One grace length. Matches PAST_DUE_GRACE_DAYS in server/billing.ts and src/lib/billing.ts.
  c_past_due_grace constant interval := interval '14 days';
  v_plan text := 'free';
  v_until timestamptz := NULL;
  v_comp_expires timestamptz;
  v_comped boolean := false;
  v_status text;
  v_period_end timestamptz;
  v_past_due_since timestamptz;
  v_grace_until timestamptz;
BEGIN
  SELECT true, fc.expires_at INTO v_comped, v_comp_expires
  FROM public.farm_comps fc
  WHERE fc.farm_id = p_farm_id AND fc.deleted_at IS NULL
    AND (fc.expires_at IS NULL OR fc.expires_at > now())
  ORDER BY fc.expires_at DESC NULLS FIRST, fc.id
  LIMIT 1;

  IF v_comped THEN
    v_plan := 'complimentary';
    v_until := v_comp_expires;
  ELSE
    SELECT s.status, s.current_period_end, s.past_due_since
      INTO v_status, v_period_end, v_past_due_since
    FROM public.farm_subscriptions s
    WHERE s.farm_id = p_farm_id AND s.deleted_at IS NULL;

    IF FOUND THEN
      IF v_status = 'active' THEN
        -- Paid through the period Stripe is billing, plus grace for a late renewal event.
        IF v_period_end IS NULL OR v_period_end + c_past_due_grace >= now() THEN
          v_plan := 'paid';
          v_until := v_period_end;
        END IF;
      ELSIF v_past_due_since IS NOT NULL AND v_status IN ('past_due', 'unpaid', 'canceled') THEN
        -- Failure grace ignores current_period_end, including a dunning cancel.
        v_grace_until := v_past_due_since + c_past_due_grace;
        IF v_grace_until >= now() THEN
          v_plan := 'paid';
          v_until := v_grace_until;
        END IF;
      ELSIF v_status = 'canceled' AND v_past_due_since IS NULL AND v_period_end > now() THEN
        v_plan := 'paid';
        v_until := v_period_end;
      END IF;
      -- trialing, incomplete, and a failure with no anchor stay on the free record book.
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
