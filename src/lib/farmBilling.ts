import { formatDisplayDate, formatIsoDate } from '@/utils/dates';
import { PAST_DUE_GRACE_DAYS } from '@/lib/billing';
import type { FarmSubscription } from '@/types/farm';

const DAY_MS = 86_400_000;

const PAYMENT_FAILURE_STATUSES = ['past_due', 'unpaid', 'canceled'];

/**
 * Display-only days left in the payment-failure grace window.
 * The window ends `PAST_DUE_GRACE_DAYS` after `past_due_since`. A missing
 * anchor has no countdown, even when `current_period_end` is still in the future.
 */
export function getPaymentGraceDays(subscription: FarmSubscription | null, now = Date.now()): number {
  if (!subscription || subscription.deleted_at || !PAYMENT_FAILURE_STATUSES.includes(subscription.status)) return 0;
  const anchor = subscription.past_due_since ? Date.parse(subscription.past_due_since) : NaN;
  if (!Number.isFinite(anchor)) return 0;
  return Math.max(0, Math.ceil((anchor + PAST_DUE_GRACE_DAYS * DAY_MS - now) / DAY_MS));
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
