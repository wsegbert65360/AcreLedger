-- Billing review hardening. This migration is intentionally not applied by the
-- coding task; it must be reviewed and deployed separately.

ALTER TABLE public.farm_subscriptions
    ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

COMMENT ON COLUMN public.farm_subscriptions.past_due_since IS
    'First observed payment-failure instant for the current delinquency; anchors the access grace window.';
COMMENT ON COLUMN public.farm_subscriptions.ended_at IS
    'Stripe subscription ended_at; immediate cancellations stop access at this instant.';

ALTER TABLE public.billing_webhook_events
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS outcome TEXT,
    ADD COLUMN IF NOT EXISTS reason TEXT;

COMMENT ON COLUMN public.billing_webhook_events.claimed_at IS
    'Webhook worker lease timestamp; stale unprocessed claims may be reclaimed.';
COMMENT ON COLUMN public.billing_webhook_events.outcome IS
    'Terminal processing outcome: applied, ignored, or unhandled.';
COMMENT ON COLUMN public.billing_webhook_events.reason IS
    'Machine-readable explanation for ignored and unhandled events.';

-- Preserve billing history if a programming error ever attempts a hard farm
-- delete. User-facing farm deletion remains soft-delete only.
ALTER TABLE public.farm_subscriptions
    DROP CONSTRAINT IF EXISTS farm_subscriptions_farm_id_fkey;
ALTER TABLE public.farm_subscriptions
    ADD CONSTRAINT farm_subscriptions_farm_id_fkey
    FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE RESTRICT;

-- Replace a farm's active subscription atomically: archive the old row and
-- insert the new row. The service-role-only webhook is the sole caller.
CREATE OR REPLACE FUNCTION public.replace_farm_subscription(
    p_farm_id UUID,
    p_current_id UUID,
    p_expected_subscription_id TEXT,
    p_expected_updated_at TIMESTAMPTZ,
    p_owner_user_id UUID,
    p_subscription JSONB
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_archived INTEGER;
    v_new_id UUID;
BEGIN
    UPDATE public.farm_subscriptions
       SET deleted_at = now(), updated_at = now()
     WHERE id = p_current_id
       AND farm_id = p_farm_id
       AND deleted_at IS NULL
       AND stripe_subscription_id IS NOT DISTINCT FROM p_expected_subscription_id
       AND updated_at IS NOT DISTINCT FROM p_expected_updated_at;
    GET DIAGNOSTICS v_archived = ROW_COUNT;
    IF v_archived <> 1 THEN
        RAISE EXCEPTION 'active subscription changed concurrently'
            USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.farm_subscriptions (
        farm_id, owner_user_id, status, trial_ends_at, current_period_end,
        cancel_at_period_end, stripe_customer_id, stripe_subscription_id,
        stripe_subscription_created_at, stripe_price_id, past_due_since,
        ended_at, updated_at
    ) VALUES (
        p_farm_id,
        p_owner_user_id,
        p_subscription->>'status',
        (p_subscription->>'trial_ends_at')::timestamptz,
        (p_subscription->>'current_period_end')::timestamptz,
        COALESCE((p_subscription->>'cancel_at_period_end')::boolean, false),
        p_subscription->>'stripe_customer_id',
        p_subscription->>'stripe_subscription_id',
        (p_subscription->>'stripe_subscription_created_at')::timestamptz,
        p_subscription->>'stripe_price_id',
        (p_subscription->>'past_due_since')::timestamptz,
        (p_subscription->>'ended_at')::timestamptz,
        COALESCE((p_subscription->>'updated_at')::timestamptz, now())
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_farm_subscription(UUID, UUID, TEXT, TIMESTAMPTZ, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_farm_subscription(UUID, UUID, TEXT, TIMESTAMPTZ, UUID, JSONB)
    TO service_role;

-- Client roles need no table-level capabilities beyond the authenticated
-- farm-scoped SELECT used by the settings UI. In particular, TRUNCATE bypasses
-- RLS and must never remain granted.
REVOKE ALL ON TABLE public.farm_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.farm_subscriptions FROM authenticated;
GRANT SELECT ON TABLE public.farm_subscriptions TO authenticated;

REVOKE ALL ON TABLE public.billing_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.farm_subscriptions, public.billing_webhook_events TO service_role;
