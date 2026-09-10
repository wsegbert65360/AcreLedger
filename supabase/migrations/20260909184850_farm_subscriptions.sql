-- Billing (Ticket D, Stripe test mode): per-farm subscription entitlement mirror.
-- Stripe Billing is synced into this table by the signed webhook in api/stripe-webhook.ts.
-- Access decisions read this table, never live Stripe API calls from the client.
-- Billing is infrastructure: NOT part of the farm backup/restore payload.

CREATE TABLE IF NOT EXISTS public.farm_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN (
        'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'
    )),
    trial_ends_at TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Exactly one active subscription row per farm; soft-deleted rows are history.
CREATE UNIQUE INDEX IF NOT EXISTS farm_subscriptions_one_active_per_farm
    ON public.farm_subscriptions(farm_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS farm_subscriptions_stripe_subscription_id
    ON public.farm_subscriptions(stripe_subscription_id);

ALTER TABLE public.farm_subscriptions ENABLE ROW LEVEL SECURITY;

-- Farm members may READ their own farm's row. No INSERT/UPDATE/DELETE policies
-- exist on purpose: every write goes through service_role (webhook + admin grants).
CREATE POLICY farm_subscriptions_select ON public.farm_subscriptions
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

GRANT SELECT ON TABLE public.farm_subscriptions TO authenticated;
GRANT ALL ON TABLE public.farm_subscriptions TO service_role;

COMMENT ON TABLE public.farm_subscriptions IS
    'Per-farm Stripe Billing entitlement mirror (test mode). Writes are service_role only; farm members may read their own farm row.';
COMMENT ON COLUMN public.farm_subscriptions.owner_user_id IS
    'Farm owner who started Checkout; only this user may start Checkout or open the Customer Portal.';

-- Webhook idempotency ledger. RLS is enabled with zero policies and grants are
-- revoked from client roles, so only service_role can touch it.
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
    stripe_event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.billing_webhook_events TO service_role;

COMMENT ON TABLE public.billing_webhook_events IS
    'Stripe webhook idempotency ledger; service_role only, never exposed to clients.';
