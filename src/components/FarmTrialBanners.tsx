import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useFarmTrial, useTrialClock } from '@/hooks/useFarmTrial';
import { fetchBillingEligibility, getCachedBillingEligibility, isBillingUiAvailable } from '@/lib/billing';
import { getFarmTrialStatus, getPaymentGraceDays, getTrialBannerThreshold, getTrialDaysLeftOverride } from '@/lib/farmTrial';
import { freshAccessToken } from '@/lib/freshAccessToken';
import * as native from '@/lib/native';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { BillingEligibility } from '@/lib/billing';
import type { FarmSubscription } from '@/types/farm';

export default function FarmTrialBanners() {
  const { search } = useLocation();
  const { farm_id, session } = useFarm();
  const farm = useFarmTrial();
  const now = useTrialClock();
  const userId = session?.user?.id;
  const billingAvailable = !native.isNativePlatform() && isBillingUiAvailable();
  const [eligibility, setEligibility] = useState<{ userId: string; capabilities: BillingEligibility } | null>(null);
  const [payment, setPayment] = useState<{ farmId: string; userId: string; subscription: FarmSubscription | null } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!billingAvailable || !userId) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const cached = getCachedBillingEligibility(userId);
        const capabilities = cached ?? await fetchBillingEligibility({
          userId, accessToken: await freshAccessToken({ message: 'Please sign in again to manage billing.' }),
          signal: controller.signal,
        });
        if (!cancelled) setEligibility({ userId, capabilities });
      } catch {
        if (!cancelled) setEligibility(null);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [billingAvailable, userId]);

  const liveCharges = billingAvailable && eligibility?.userId === userId && eligibility?.capabilities.allowlisted === true && eligibility.capabilities.liveCharges === true;

  useEffect(() => {
    if (!liveCharges || !farm_id || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from('farm_subscriptions').select('*')
          .eq('farm_id', farm_id).is('deleted_at', null).maybeSingle();
        if (!cancelled) setPayment({ farmId: farm_id, userId, subscription: error ? null : data });
      } catch {
        if (!cancelled) setPayment(null);
      }
    })();
    return () => { cancelled = true; };
  }, [liveCharges, farm_id, userId]);

  if (!farm_id || !userId) return null;
  const daysOverride = getTrialDaysLeftOverride(import.meta.env.VITE_VERCEL_ENV, search);
  const trial = daysOverride === null
    ? getFarmTrialStatus(farm?.trial_ends_at, now)
    : { phase: daysOverride > 0 ? 'active' : 'ended', daysLeft: daysOverride };
  const threshold = trial.phase === 'active' ? getTrialBannerThreshold(trial.daysLeft) : null;
  const reminderKey = `${userId}:${farm_id}:${farm?.trial_ends_at}:${threshold}`;
  const canSubscribe = billingAvailable && eligibility?.userId === userId && eligibility.capabilities.allowlisted && eligibility.capabilities.checkoutEnabled;
  const graceDays = liveCharges && payment?.farmId === farm_id && payment?.userId === userId
    ? getPaymentGraceDays(payment.subscription, now) : 0;
  const showTrial = threshold !== null && dismissed !== reminderKey;
  if (!showTrial && graceDays <= 0) return null;

  return (
    <aside aria-label="Farm trial notices" className="mx-auto max-w-lg space-y-3 px-4 py-3 lg:max-w-5xl lg:px-8 print:hidden">
      {showTrial && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-plant/30 bg-plant/10 p-4 text-foreground">
          <p className="flex-1 text-sm">{trial.daysLeft} days left in your free trial.</p>
          {canSubscribe && <Button asChild className="min-h-11"><Link to="/settings?section=billing">Subscribe</Link></Button>}
          <Button variant="ghost" className="min-h-11" aria-label="Dismiss trial reminder" onClick={() => setDismissed(reminderKey)}>Dismiss</Button>
        </div>
      )}
      {graceDays > 0 && (
        <p role="status" className="rounded-2xl border border-harvest/30 bg-harvest/10 p-4 text-sm text-foreground">
          Your payment didn't go through. Update your card in the next {graceDays} days to keep adding records. Your records stay safe either way.
        </p>
      )}
    </aside>
  );
}
