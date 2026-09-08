import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getFarmBillingAccess,
  isBillingAllowlisted,
  isBillingUiAvailable,
  requestBillingSession,
} from '@/lib/billing';
import { native } from '@/lib/native';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { FarmSubscription } from '@/types/farm';
import { formatIsoDate } from '@/utils/dates';

function getStatusBadge(subscription: FarmSubscription | null): { label: string; className: string } {
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
  const billingUiEnabled = isBillingUiAvailable();

  const { session, farm_id } = useFarm();
  const [subscription, setSubscription] = useState<FarmSubscription | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;

  useEffect(() => {
    if (!farm_id || !userId) {
      setSubscription(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('farm_subscriptions')
      .select('*')
      .eq('farm_id', farm_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
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
      const token = session?.access_token;
      if (!token) return;
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
    [session?.access_token],
  );

  if (!billingUiEnabled || !session || !farm_id) return null;

  const allowlisted = isBillingAllowlisted(
    { email: userEmail, userId },
    import.meta.env.VITE_BILLING_ALLOWLIST as string | undefined,
  );
  const access = getFarmBillingAccess({ subscription });
  const hasActiveRow = subscription != null && subscription.deleted_at == null;
  const isOwner = hasActiveRow && subscription.owner_user_id === userId;
  // No row yet: the first allowlisted member to check out becomes the owner.
  const canManage = !hasActiveRow || isOwner;
  const badge = getStatusBadge(subscription);
  const needsCheckout = subscription == null || access.phase === 'locked' || subscription.status === 'canceled';
  const canOpenPortal = hasActiveRow && isOwner && subscription.stripe_customer_id != null;

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-foreground text-lg">
          <span className="flex items-center gap-2">
            <CreditCard size={18} className="text-primary" />
            Billing
          </span>
          <Badge variant="outline" className={`rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!allowlisted ? (
          <p className="text-sm text-muted-foreground">
            Billing is coming soon. AcreLedger is free for your farm while billing rolls out.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{getStatusLine(subscription)}</p>
            {hasActiveRow && !isOwner && (
              <p className="text-sm text-muted-foreground">
                Ask the farm owner to manage billing for this farm.
              </p>
            )}
            {canManage && needsCheckout && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => openBillingSession('checkout')}
                  disabled={isBusy}
                  size="sm"
                  className="min-h-11 bg-plant text-plant-foreground hover:bg-plant/90"
                >
                  Start 4-month free trial
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
