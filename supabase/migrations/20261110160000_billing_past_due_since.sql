-- Failed renewal payments keep Pro for 14 days from the first failure, not until
-- Stripe's current_period_end. Stripe advances current_period_end when it creates
-- the renewal invoice, before payment succeeds, so past_due / unpaid / a dunning
-- cancel must not inherit that unpaid year.
--
-- A normal cancel (past_due_since IS NULL) keeps Pro through the period already
-- paid for. active keeps Pro until current_period_end. trialing, incomplete, a
-- failure with no anchor, and a missing or soft-deleted row are the free record
-- book. Complimentary farm_comps still win.
--
-- past_due_since is written only by the signed webhook (service_role). Clients
-- may SELECT the mirror, including this column, and must not write it. Nothing
-- in this migration deletes or rewrites existing subscription rows.

ALTER TABLE public.farm_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

COMMENT ON COLUMN public.farm_subscriptions.past_due_since IS
  'First observed renewal-payment failure. Pro grace ends 14 days later. NULL after a successful payment or when no failure is open. service_role writes only.';

-- Same client-write revoke as 20260917043144. New columns inherit table
-- privileges, so re-state them: authenticated may SELECT; clients do not write.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.farm_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.farm_subscriptions TO authenticated;
GRANT ALL ON TABLE public.farm_subscriptions TO service_role;

REVOKE INSERT (past_due_since), UPDATE (past_due_since)
  ON TABLE public.farm_subscriptions
  FROM PUBLIC, anon, authenticated;

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
        -- Paid through the period Stripe is billing. Unchanged from the previous function.
        v_plan := 'paid';
        v_until := v_period_end;
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
