-- Preserve the creation instant of the Stripe subscription currently mirrored
-- for a farm. The webhook uses this to reject delayed events from an older
-- subscription after a replacement checkout has completed.
ALTER TABLE public.farm_subscriptions
    ADD COLUMN IF NOT EXISTS stripe_subscription_created_at TIMESTAMPTZ;

COMMENT ON COLUMN public.farm_subscriptions.stripe_subscription_created_at IS
    'Stripe subscription.created converted to timestamptz; protects the entitlement mirror from stale replacement events.';
