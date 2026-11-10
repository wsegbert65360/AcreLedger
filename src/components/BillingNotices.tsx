import { useEffect, useState } from 'react';
import { useNowClock } from '@/hooks/useFarmComp';
import { fetchBillingEligibility, getCachedBillingEligibility, isBillingUiAvailable } from '@/lib/billing';
import { getPaymentGraceDays } from '@/lib/farmBilling';
import { freshAccessToken } from '@/lib/freshAccessToken';
import * as native from '@/lib/native';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/store/farmStore';
import type { BillingEligibility } from '@/lib/billing';
import type { FarmSubscription } from '@/types/farm';

export default function BillingNotices() {  const { farm_id, session } = useFarm();
  const now = useNowClock();
  const userId = session?.user?.id;
  const billingAvailable = !native.isNativePlatform() && isBillingUiAvailable();
  const [eligibility, setEligibility] = useState<{ userId: string; capabilities: BillingEligibility } | null>(null);
  const [payment, setPayment] = useState<{ farmId: string; userId: string; subscription: FarmSubscription | null } | null>(null);

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

  // The native app is a free companion (App Review 3.1.3(f)): no payment wording.
  if (native.isNativePlatform() || !farm_id || !userId) return null;
  const graceDays = liveCharges && payment?.farmId === farm_id && payment?.userId === userId
    ? getPaymentGraceDays(payment.subscription, now) : 0;
  if (graceDays <= 0) return null;

  return (
    <aside aria-label="Billing notices" className="mx-auto max-w-lg space-y-3 px-4 py-3 lg:max-w-5xl lg:px-8 print:hidden">
      <p role="status" className="rounded-2xl border border-harvest/30 bg-harvest/10 p-4 text-sm text-foreground">
        Your payment didn't go through. Update your card in the next {graceDays} {graceDays === 1 ? 'day' : 'days'} to keep Pro. After that your farm moves to the free record book, and your records stay safe.
      </p>
    </aside>
  );
}
