import { describe, expect, it } from 'vitest';

import {
  HANDLED_WEBHOOK_EVENT_TYPES,
  PAST_DUE_GRACE_DAYS,
  TRIAL_PERIOD_DAYS,
  assertTestModeBilling,
  buildSubscriptionUpsert,
  canOpenPortal,
  canStartCheckout,
  isBillingAllowlisted,
  isUniqueViolation,
  mapStripeStatusToBillingStatus,
  parseBillingAllowlist,
  readSubscriptionMetadata,
} from '../../server/billing';

const TEST_ENV = {
  BILLING_LIVE_CHARGES: 'false',
  STRIPE_SECRET_KEY: 'sk_test_abc123',
  STRIPE_PRICE_ID: 'price_test_abc123',
};

describe('billing constants', () => {
  it('matches the locked product decisions', () => {
    expect(TRIAL_PERIOD_DAYS).toBe(122);
    expect(PAST_DUE_GRACE_DAYS).toBe(3);
  });
});

describe('assertTestModeBilling', () => {
  it('accepts explicit test-mode configuration', () => {
    const check = assertTestModeBilling(TEST_ENV);
    expect(check).toEqual({
      ok: true,
      config: { secretKey: 'sk_test_abc123', priceId: 'price_test_abc123' },
    });
  });

  it('accepts a missing BILLING_LIVE_CHARGES as test mode', () => {
    const check = assertTestModeBilling({ ...TEST_ENV, BILLING_LIVE_CHARGES: undefined });
    expect(check.ok).toBe(true);
  });

  it('refuses when live charges are requested', () => {
    const check = assertTestModeBilling({ ...TEST_ENV, BILLING_LIVE_CHARGES: 'true' });
    expect(check).toMatchObject({ ok: false });
    expect(check.ok === false && check.reason).toMatch(/live charges/i);
  });

  it('refuses live secret keys and missing or malformed keys', () => {
    expect(assertTestModeBilling({ ...TEST_ENV, STRIPE_SECRET_KEY: 'sk_live_zzz' })).toMatchObject({
      ok: false,
    });
    expect(assertTestModeBilling({ ...TEST_ENV, STRIPE_SECRET_KEY: '' })).toMatchObject({ ok: false });
    expect(assertTestModeBilling({ ...TEST_ENV, STRIPE_SECRET_KEY: 'not-a-key' })).toMatchObject({
      ok: false,
    });
  });

  it('refuses a missing or malformed price id', () => {
    expect(assertTestModeBilling({ ...TEST_ENV, STRIPE_PRICE_ID: '' })).toMatchObject({ ok: false });
    expect(assertTestModeBilling({ ...TEST_ENV, STRIPE_PRICE_ID: 'prod_123' })).toMatchObject({
      ok: false,
    });
  });
});

describe('billing allowlist', () => {
  it('parses entries case-insensitively and drops empties', () => {
    expect(parseBillingAllowlist('A@B.com, c ,,')).toEqual(['a@b.com', 'c']);
    expect(parseBillingAllowlist(undefined)).toEqual([]);
  });

  it('matches email or user id, denies an empty allowlist', () => {
    expect(isBillingAllowlisted({ email: 'a@b.com', userId: 'u9' }, 'a@b.com')).toBe(true);
    expect(isBillingAllowlisted({ email: null, userId: 'U9' }, 'a@b.com,u9')).toBe(true);
    expect(isBillingAllowlisted({ email: 'z@b.com', userId: 'u1' }, 'a@b.com')).toBe(false);
    expect(isBillingAllowlisted({ email: 'a@b.com' }, '')).toBe(false);
  });
});

describe('canStartCheckout (owner gate)', () => {
  const caller = 'user-1';

  it('allows the first checkout for a farm with no row and stamps the caller as owner', () => {
    expect(canStartCheckout(null, caller)).toEqual({ ok: true });
    expect(canStartCheckout(undefined, caller)).toEqual({ ok: true });
  });

  it('refuses when the active row belongs to a different user', () => {
    const existing = { owner_user_id: 'user-2', status: 'trialing', deleted_at: null };
    expect(canStartCheckout(existing, caller)).toEqual({ ok: false, reason: 'not_owner' });
  });

  it('refuses a duplicate checkout for the owner of an active subscription', () => {
    for (const status of ['trialing', 'active'] as const) {
      const existing = { owner_user_id: caller, status, deleted_at: null };
      expect(canStartCheckout(existing, caller)).toEqual({
        ok: false,
        reason: 'already_subscribed',
      });
    }
  });

  it('allows the owner to recover from non-active states with a new checkout', () => {
    for (const status of ['past_due', 'canceled', 'unpaid', 'incomplete'] as const) {
      const existing = { owner_user_id: caller, status, deleted_at: null };
      expect(canStartCheckout(existing, caller)).toEqual({ ok: true });
    }
  });

  it('ignores soft-deleted rows for both gates', () => {
    const deletedOtherOwner = { owner_user_id: 'user-2', status: 'active', deleted_at: '2026-09-01T00:00:00.000Z' };
    expect(canStartCheckout(deletedOtherOwner, caller)).toEqual({ ok: true });
  });
});

describe('canOpenPortal (owner gate)', () => {
  const caller = 'user-1';
  const activeRow = {
    owner_user_id: caller,
    stripe_customer_id: 'cus_test_1',
    deleted_at: null,
  };

  it('refuses when the farm has no subscription row', () => {
    expect(canOpenPortal(null, caller)).toEqual({ ok: false, reason: 'no_subscription' });
  });

  it('refuses soft-deleted rows', () => {
    expect(canOpenPortal({ ...activeRow, deleted_at: '2026-09-01T00:00:00.000Z' }, caller)).toEqual({
      ok: false,
      reason: 'no_subscription',
    });
  });

  it('refuses non-owners and rows without a Stripe customer', () => {
    expect(canOpenPortal({ ...activeRow, owner_user_id: 'user-2' }, caller)).toEqual({
      ok: false,
      reason: 'not_owner',
    });
    expect(canOpenPortal({ ...activeRow, stripe_customer_id: null }, caller)).toEqual({
      ok: false,
      reason: 'not_configured',
    });
  });

  it('allows the owner of an active row', () => {
    expect(canOpenPortal(activeRow, caller)).toEqual({ ok: true });
  });
});

describe('mapStripeStatusToBillingStatus', () => {
  it('passes known statuses through', () => {
    for (const status of ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete']) {
      expect(mapStripeStatusToBillingStatus(status)).toBe(status);
    }
  });

  it('folds incomplete_expired into canceled and defaults unknowns to incomplete', () => {
    expect(mapStripeStatusToBillingStatus('incomplete_expired')).toBe('canceled');
    expect(mapStripeStatusToBillingStatus('something_new')).toBe('incomplete');
  });
});

describe('buildSubscriptionUpsert (webhook mapper)', () => {
  it('maps a full Stripe subscription into row values', () => {
    const upsert = buildSubscriptionUpsert({
      id: 'sub_stripe_1',
      status: 'trialing',
      customer: 'cus_test_1',
      trial_end: 1799366400, // 2027-01-08T00:00:00Z
      current_period_end: 1799366400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_test_1' } }] },
    });
    expect(upsert).toEqual({
      status: 'trialing',
      trial_ends_at: '2027-01-08T00:00:00.000Z',
      current_period_end: '2027-01-08T00:00:00.000Z',
      cancel_at_period_end: false,
      stripe_customer_id: 'cus_test_1',
      stripe_subscription_id: 'sub_stripe_1',
      stripe_price_id: 'price_test_1',
    });
  });

  it('resolves expanded customer objects and emits null (never undefined) for missing optionals', () => {
    const upsert = buildSubscriptionUpsert({
      id: 'sub_stripe_2',
      status: 'weird_future_status',
      customer: { id: 'cus_expanded_1' },
    });
    expect(upsert.stripe_customer_id).toBe('cus_expanded_1');
    expect(upsert.status).toBe('incomplete');
    expect(upsert.trial_ends_at).toBeNull();
    expect(upsert.current_period_end).toBeNull();
    expect(upsert.stripe_price_id).toBeNull();
    expect(upsert.cancel_at_period_end).toBe(false);
    expect(Object.values(upsert).every(v => v !== undefined)).toBe(true);
  });

  it('ignores malformed epoch values instead of producing Invalid Date strings', () => {
    const upsert = buildSubscriptionUpsert({
      id: 'sub_stripe_3',
      status: 'active',
      trial_end: Number.NaN,
      current_period_end: undefined,
    });
    expect(upsert.trial_ends_at).toBeNull();
    expect(upsert.current_period_end).toBeNull();
  });
});

describe('webhook plumbing helpers', () => {
  it('reads farm/owner metadata and treats blanks as missing', () => {
    expect(readSubscriptionMetadata({ farm_id: 'farm-1', user_id: 'user-1' })).toEqual({
      farmId: 'farm-1',
      userId: 'user-1',
    });
    expect(readSubscriptionMetadata({ farm_id: '  ' })).toEqual({ farmId: null, userId: null });
    expect(readSubscriptionMetadata(null)).toEqual({ farmId: null, userId: null });
  });

  it('covers exactly the entitlement-updating event types', () => {
    expect([...HANDLED_WEBHOOK_EVENT_TYPES].sort()).toEqual([
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.deleted',
      'customer.subscription.updated',
      'invoice.paid',
      'invoice.payment_failed',
    ]);
  });

  it('detects the Postgres unique violation used for webhook idempotency', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
