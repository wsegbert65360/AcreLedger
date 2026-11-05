import { describe, expect, it } from 'vitest';

import { getFarmAccessState, isBillingEnforced } from '@/lib/farmAccess';
import type { FarmSubscription } from '@/types/farm';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function sub(overrides: Partial<FarmSubscription>): FarmSubscription {
  return {
    id: 'sub-1', farm_id: 'farm-1', owner_user_id: 'user-1', status: 'active',
    trial_ends_at: null, current_period_end: iso(NOW + 300 * DAY), cancel_at_period_end: false,
    stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', stripe_subscription_created_at: null,
    stripe_price_id: 'price_1', created_at: iso(NOW), updated_at: iso(NOW), deleted_at: null,
    ...overrides,
  };
}

const base = { enforce: true, loaded: true, trialEndsAt: iso(NOW - DAY), comp: null, subscription: null, nowMs: NOW };

describe('isBillingEnforced', () => {
  it('turns on only for the exact string true', () => {
    expect(isBillingEnforced({ VITE_BILLING_ENFORCE: 'true' })).toBe(true);
    expect(isBillingEnforced({ VITE_BILLING_ENFORCE: 'TRUE' })).toBe(false);
    expect(isBillingEnforced({ VITE_BILLING_ENFORCE: '1' })).toBe(false);
    expect(isBillingEnforced({})).toBe(false);
    expect(isBillingEnforced(undefined)).toBe(false);
  });
});

describe('getFarmAccessState', () => {
  it('never locks when enforcement is off', () => {
    expect(getFarmAccessState({ ...base, enforce: false })).toEqual({ readOnly: false, reason: 'not-enforced' });
  });

  it('fails open until billing data has loaded', () => {
    expect(getFarmAccessState({ ...base, loaded: false })).toEqual({ readOnly: false, reason: 'unknown' });
  });

  it('locks a farm whose trial ended with no subscription', () => {
    expect(getFarmAccessState(base)).toEqual({ readOnly: true, reason: 'trial-ended' });
  });

  it('keeps full access during the trial, up to the deadline instant', () => {
    expect(getFarmAccessState({ ...base, trialEndsAt: iso(NOW + 1) }).reason).toBe('trial');
    expect(getFarmAccessState({ ...base, trialEndsAt: iso(NOW) }).readOnly).toBe(true);
  });

  it('keeps full access for farms never stamped with a trial', () => {
    expect(getFarmAccessState({ ...base, trialEndsAt: null })).toEqual({ readOnly: false, reason: 'no-trial-date' });
    expect(getFarmAccessState({ ...base, trialEndsAt: 'not a date' }).reason).toBe('no-trial-date');
  });

  it('lets a live comp override an ended trial, but not an expired comp', () => {
    expect(getFarmAccessState({ ...base, comp: { is_comped: true, expires_at: null } }).reason).toBe('comped');
    expect(getFarmAccessState({ ...base, comp: { is_comped: true, expires_at: iso(NOW - 1) } }).readOnly).toBe(true);
  });

  it('grants access for active, trialing, and in-grace subscriptions', () => {
    expect(getFarmAccessState({ ...base, subscription: sub({ status: 'active' }) }).reason).toBe('subscribed');
    expect(getFarmAccessState({ ...base, subscription: sub({ status: 'trialing' }) }).reason).toBe('subscribed');
    expect(getFarmAccessState({ ...base, subscription: sub({ status: 'past_due', current_period_end: iso(NOW - 5 * DAY) }) }).reason).toBe('subscribed');
    expect(getFarmAccessState({ ...base, subscription: sub({ status: 'canceled', current_period_end: iso(NOW + DAY) }) }).reason).toBe('subscribed');
  });

  it('locks a lapsed subscription even without a trial date', () => {
    const lapsed = sub({ status: 'canceled', current_period_end: iso(NOW - DAY) });
    expect(getFarmAccessState({ ...base, trialEndsAt: null, subscription: lapsed })).toEqual({ readOnly: true, reason: 'subscription-ended' });
    expect(getFarmAccessState({ ...base, subscription: sub({ status: 'past_due', current_period_end: iso(NOW - 15 * DAY) }) }).readOnly).toBe(true);
  });

  it('lets an unfinished checkout fall back to the running trial', () => {
    expect(getFarmAccessState({ ...base, trialEndsAt: iso(NOW + DAY), subscription: sub({ status: 'incomplete' }) }).reason).toBe('trial');
  });

  it('ignores a soft-deleted subscription row', () => {
    const deleted = sub({ status: 'canceled', current_period_end: iso(NOW - DAY), deleted_at: iso(NOW) });
    expect(getFarmAccessState({ ...base, trialEndsAt: null, subscription: deleted }).reason).toBe('no-trial-date');
  });
});
