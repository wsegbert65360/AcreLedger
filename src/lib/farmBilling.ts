import { formatDisplayDate, formatIsoDate } from '@/utils/dates';
import { PAST_DUE_GRACE_DAYS } from '@/lib/billing';
import type { FarmSubscription } from '@/types/farm';

const DAY_MS = 86_400_000;

/** Display-only days left in the shared past-due grace window. Does not change entitlement enforcement. */
export function getPaymentGraceDays(subscription: FarmSubscription | null, now = Date.now()): number {
  if (!subscription || subscription.deleted_at || !['past_due', 'unpaid'].includes(subscription.status)) return 0;
  const end = subscription.current_period_end ? Date.parse(subscription.current_period_end) : NaN;
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end + PAST_DUE_GRACE_DAYS * DAY_MS - now) / DAY_MS)) : 0;
}

/** Recheck expiry with the display clock so mounted comps cannot outlive their deadline. */
export function isFarmComped(comp: import('@/types/database').FarmCompStatus | null | undefined, now = Date.now()): boolean {
  return comp?.is_comped === true && (comp.expires_at === null || Date.parse(comp.expires_at) > now);
}

/** Billing dates are timestamps; display their local calendar date. */
export function formatBillingDate(value: string | null | undefined): string {
  if (!value) return '';
  return value.includes('T') ? formatDisplayDate(new Date(value)) : formatIsoDate(value);
}
