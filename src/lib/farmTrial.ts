import type { FarmSubscription } from '@/types/farm';

const DAY_MS = 86_400_000;

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

/** Display-only future 14-day grace policy; does not change entitlement enforcement. */
export function getPaymentGraceDays(subscription: FarmSubscription | null, now = Date.now()): number {
  if (!subscription || subscription.deleted_at || !['past_due', 'unpaid'].includes(subscription.status)) return 0;
  const end = subscription.current_period_end ? Date.parse(subscription.current_period_end) : NaN;
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end + 14 * DAY_MS - now) / DAY_MS)) : 0;
}
