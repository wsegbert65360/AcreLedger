import { formatDisplayDate, formatIsoDate } from '@/utils/dates';
import { PAST_DUE_GRACE_DAYS } from '@/lib/billing';
import type { FarmSubscription } from '@/types/farm';

const DAY_MS = 86_400_000;

/** Preview-only banner display override. Never use for trial dates or entitlements. */
export function getTrialDaysLeftOverride(env: string | undefined, search: string): number | null {
  if (env !== 'preview') return null;
  const value = new URLSearchParams(search).get('trialDaysLeft');
  if (value === null || !/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isSafeInteger(days) ? days : null;
}

/** Server timestamps are instants. Ceil partial days; never expire before the deadline. */
export function getFarmTrialStatus(trialEndsAt: string | null | undefined, now = Date.now()) {
  const end = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  if (!Number.isFinite(end)) return { phase: 'none' as const, daysLeft: 0 };
  if (end <= now) return { phase: 'ended' as const, daysLeft: 0 };
  return { phase: 'active' as const, daysLeft: Math.ceil((end - now) / DAY_MS) };
}

/** Continuous reminder windows: 8-14, 2-7, and 1 remaining day. */
export function getTrialBannerThreshold(daysLeft: number): 14 | 7 | 1 | null {
  if (daysLeft <= 0 || daysLeft > 14) return null;
  return daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : 14;
}

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

/** Billing deadlines are timestamps; display their local calendar date. */
export function formatFarmTrialDate(value: string | null | undefined): string {
  if (!value) return '';
  return value.includes('T') ? formatDisplayDate(new Date(value)) : formatIsoDate(value);
}
