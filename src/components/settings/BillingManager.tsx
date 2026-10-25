import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFarmTrial, useTrialClock } from '@/hooks/useFarmTrial';
import {
  fetchBillingEligibility,
  getCachedBillingEligibility,
  isBillingUiAvailable,
  requestBillingSession,
} from '@/lib/billing';
import { getFarmTrialStatus } from '@/lib/farmTrial';
import { freshAccessToken } from '@/lib/freshAccessToken';
import { native } from '@/lib/native';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { FarmSubscription } from '@/types/farm';
import { formatIsoDate } from '@/utils/dates';

function getStatusBadge(subscription: FarmSubscription | null, { allowlisted }: { allowlisted: boolean }): { label: string; className: string } {
  if (!allowlisted) return { label: 'Free', className: 'bg-plant/10 text-plant border-plant/20' };
  if (!subscription || subscription.deleted_at) {
    return { label: 'Not subscribed', className: 'bg-muted text-muted-foreground border-border' };
  }
  switch (subscription.status) {
    case 'trialing':
      return { label: 'Free trial', className: 'bg-plant/10 text-plant border-plant/20' };
    case 'active':
      return { label: 'Active', className: 'bg-plant/10 text-plant border-plant/20' };
    case 'past_due':
    case 'unpaid':
      return { label: 'Action needed', className: 'bg-harvest/10 text-harvest border-harvest/20' };
    case 'canceled':
      return { label: 'Canceled', className: 'bg-muted text-muted-foreground border-border' };
    default:
      return { label: 'Not subscribed', className: 'bg-muted text-muted-foreground border-border' };
  }
}

function getStatusLine(subscription: FarmSubscription | null): string {
  if (!subscription || subscription.deleted_at) {
    return 'No billing subscription for this farm yet.';
  }
  switch (subscription.status) {
    case 'trialing':
      return `Full access on your free trial through ${formatIsoDate(subscription.trial_ends_at) || 'your trial end date'}. $299/year starts after the trial.`;
    case 'active':
      return subscription.cancel_at_period_end
        ? `Active through ${formatIsoDate(subscription.current_period_end) || 'your period end date'}, then cancels.`
        : `Active. Renews yearly on ${formatIsoDate(subscription.current_period_end) || 'your renewal date'}.`;
    case 'past_due':
    case 'unpaid':
      return 'There was a payment problem. Update your payment method to keep full access.';
    case 'canceled':
      return 'Your subscription was canceled. Reactivate any time from checkout below.';
    default:
      return 'Checkout was not completed, so billing is not active yet.';
  }
}

export default function BillingManager() {
  const farmTrial = useFarmTrial();
  const now = useTrialClock();
  const trialActive = getFarmTrialStatus(farmTrial?.trial_ends_at, now).phase === 'active';
  const billingUiEnabled = isBillingUiAvailable();

  const { session, farm_id } = useFarm();
  const [subscription, setSubscription] = useState<FarmSubscription | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [eligibility, setEligibility] = useState<{ userId: string; allowlisted: boolean; checkoutEnabled: boolean } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const userId = session?.user?.id ?? null;
  const checkoutEnabled = userId != null && eligibility?.userId === userId && eligibility.checkoutEnabled;
  const allowlisted = userId != null && eligibility?.userId === userId ? eligibility.allowlisted : null;

  useEffect(() => {
    setSubscriptionLoaded(false);
    setSubscription(null);
    if (!farm_id || !userId) {
      setSubscription(null);
      setSubscriptionLoaded(true);
      return;
    }
    let cancelled = false;
    supabase
      .from('farm_subscriptions')
      .select('*')
      .eq('farm_id', farm_id)
      .is('deleted_at', null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setSubscriptionLoaded(true);
        if (error) {
          toast.error('Could not load billing status.');
          return;
        }
        setSubscription((data as FarmSubscription | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [farm_id, userId]);

  useEffect(() => {
    if (!billingUiEnabled || !userId) {
      setEligibility(null);
      return;
    }

    const cached = getCachedBillingEligibility(userId);
    if (cached !== undefined) {
      setEligibility({ userId, allowlisted: cached.allowlisted, checkoutEnabled: cached.checkoutEnabled });
      return;
    }

    setEligibility(null);
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const token = await freshAccessToken({
          message: 'Please sign in again to manage billing.',
        });
        if (cancelled || controller.signal.aborted) return;
        const value = await fetchBillingEligibility({
          userId,
          accessToken: token,
          signal: controller.signal,
        });
        if (cancelled || controller.signal.aborted) return;
        setEligibility({ userId, allowlisted: value.allowlisted, checkoutEnabled: value.checkoutEnabled });
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setEligibility({ userId, allowlisted: false, checkoutEnabled: false });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [billingUiEnabled, userId]);

  // One-shot notices when Stripe redirects back to Settings.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (!billing) return;
    params.delete('billing');
    const nextQuery = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (nextQuery ? `?${nextQuery}` : ''),
    );
    if (billing === 'success') {
      toast.success('Thanks! Your subscription is being finalized.');
    } else if (billing === 'cancelled') {
      toast.info('Checkout cancelled — no changes were made.');
    }
  }, []);

  const openBillingSession = useCallback(
    async (kind: 'checkout' | 'portal') => {
      // Always rotate the token immediately before posting the bearer: the
      // useFarm() snapshot can hold an expired JWT, and the token must
      // survive the round trip to the billing function.
      const { data: { session: refreshed }, error: refreshError } = await supabase.auth.refreshSession();
      const token = refreshed?.access_token;
      if (refreshError || !token) {
        toast.error('Please sign in again to manage billing.');
        return;
      }
      native.haptic.light();
      setIsBusy(true);
      try {
        const url = await requestBillingSession(kind, { accessToken: token });
        window.location.assign(url);
      } catch (err: unknown) {
        native.haptic.error();
        toast.error(err instanceof Error ? err.message : 'Billing request failed');
        setIsBusy(false);
      }
    },
    [],
  );

  if (!billingUiEnabled || !session || !farm_id) return null;

  const eligibilityKnown = allowlisted !== null;
  const hasActiveRow = subscription != null && subscription.deleted_at == null;
  const isOwner = hasActiveRow && subscription.owner_user_id === userId;
  // No row yet: the first allowlisted member to check out becomes the owner.
  const canManage = !hasActiveRow || isOwner;
  const badge = getStatusBadge(subscription, { allowlisted: allowlisted === true });
  // past_due/unpaid subscriptions are still live in Stripe, so those owners fix
  // payment in the portal; a second Checkout would create a parallel subscription.
  const needsCheckout =
    subscription == null ||
    subscription.deleted_at != null ||
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete';
  const hadPriorSubscription = subscription?.stripe_subscription_id != null;
  const canOpenPortal = hasActiveRow && isOwner && subscription.stripe_customer_id != null;

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-foreground text-lg">
          <span className="flex items-center gap-2">
            <CreditCard size={18} className="text-primary" />
            Billing
          </span>
          {eligibilityKnown && (!allowlisted || subscriptionLoaded) && <Badge variant="outline" className={`rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {trialActive && (
          <section aria-label="Farm free trial" className="space-y-2">
            <p className="text-sm text-foreground">Free trial: full access until {formatIsoDate(farmTrial?.trial_ends_at)}. No card needed.</p>
            <p className="text-sm text-muted-foreground">Your free trial started when you set up this farm. Each farm gets one.</p>
          </section>
        )}
        {!eligibilityKnown ? null : !allowlisted ? (
          <p className="text-sm text-muted-foreground">
            3-month free trial, no card needed. Then $299 per farm per year.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{getStatusLine(subscription)}</p>
            {hasActiveRow && !isOwner && (
              <p className="text-sm text-muted-foreground">
                Ask the farm owner to manage billing for this farm.
              </p>
            )}
            {checkoutEnabled && canManage && needsCheckout && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => openBillingSession('checkout')}
                  disabled={isBusy}
                  size="sm"
                  className="min-h-11 bg-plant text-plant-foreground hover:bg-plant/90"
                >
                  {hadPriorSubscription ? 'Reactivate subscription' : 'Start 4-month free trial'}
                </Button>
              </div>
            )}
            {canOpenPortal && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => openBillingSession('portal')}
                  disabled={isBusy}
                  size="sm"
                  variant="outline"
                  className="min-h-11 border-border text-foreground hover:bg-muted"
                >
                  Manage billing
                </Button>
              </div>
            )}
            {canManage && subscription == null && (
              <p className="text-xs text-muted-foreground">
                $299/year after the trial. Your payment method is collected at checkout; the first
                charge happens when the trial ends.
              </p>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy policy
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
