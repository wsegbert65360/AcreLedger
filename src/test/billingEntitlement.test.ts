import { describe, expect, it, vi } from 'vitest';

import {
  getFarmBillingAccess,
  isBillingAllowlisted,
  isBillingUiEnabled,
  parseBillingAllowlist,
  requestBillingSession,
} from '@/lib/billing';
import type { FarmSubscription } from '@/types/farm';

function makeSubscription(overrides: Partial<FarmSubscription> = {}): FarmSubscription {
  return {
    id: 'sub-1',
    farm_id: 'farm-1',
    owner_user_id: 'user-1',
    status: 'trialing',
    trial_ends_at: '2027-01-08T00:00:00.000Z',
    current_period_end: '2027-01-08T00:00:00.000Z',
    cancel_at_period_end: false,
    stripe_customer_id: 'cus_test_1',
    stripe_subscription_id: 'sub_stripe_1',
    stripe_price_id: 'price_test_1',
    created_at: '2026-09-08T00:00:00.000Z',
    updated_at: '2026-09-08T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const BEFORE_PERIOD_END = '2027-01-01T00:00:00.000Z'; // 7 days before 2027-01-08
const AFTER_PERIOD_END = '2027-01-20T00:00:00.000Z';

describe('getFarmBillingAccess', () => {
  it('grants full access for trialing and active subscriptions', () => {
    for (const status of ['trialing', 'active'] as const) {
      const access = getFarmBillingAccess({
        subscription: makeSubscription({ status }),
        nowMs: Date.parse(BEFORE_PERIOD_END),
      });
      expect(access).toEqual({
        hasAccess: true,
        inGrace: false,
        phase: status,
        status,
      });
    }
  });

  it('treats a missing row as allowed while enforcement is off (BILLING_ENFORCE default)', () => {
    const access = getFarmBillingAccess({ subscription: null, nowMs: Date.now() });
    expect(access).toEqual({
      hasAccess: true,
      inGrace: false,
      phase: 'unmanaged',
      status: 'none',
    });
  });

  it('locks a missing row once enforcement is on', () => {
    const access = getFarmBillingAccess({ subscription: null, enforce: true, nowMs: Date.now() });
    expect(access.hasAccess).toBe(false);
    expect(access.phase).toBe('locked');
  });

  it('locks a soft-deleted row once enforcement is on and allows it while off', () => {
    const deleted = makeSubscription({ deleted_at: '2026-09-01T00:00:00.000Z' });
    expect(getFarmBillingAccess({ subscription: deleted, enforce: true }).hasAccess).toBe(false);
    expect(getFarmBillingAccess({ subscription: deleted, enforce: false }).hasAccess).toBe(true);
  });

  it('keeps past_due access inside the 3-day grace window after period end', () => {
    // Period ends 2027-01-08; 2027-01-11T00:00:00Z is exactly +3 days.
    const nowMs = Date.parse('2027-01-11T00:00:00.000Z');
    const access = getFarmBillingAccess({
      subscription: makeSubscription({ status: 'past_due' }),
      nowMs,
    });
    expect(access).toEqual({ hasAccess: true, inGrace: true, phase: 'grace', status: 'past_due' });
  });

  it('locks past_due after the grace window expires', () => {
    const nowMs = Date.parse('2027-01-11T00:00:00.001Z');
    const access = getFarmBillingAccess({
      subscription: makeSubscription({ status: 'past_due' }),
      nowMs,
    });
    expect(access.hasAccess).toBe(false);
    expect(access.phase).toBe('locked');
  });

  it('honors a custom grace window for past_due', () => {
    const nowMs = Date.parse('2027-01-13T00:00:00.000Z'); // +5 days past period end
    const options = {
      subscription: makeSubscription({ status: 'past_due' }),
      nowMs,
    };
    expect(getFarmBillingAccess({ ...options, graceDays: 7 }).hasAccess).toBe(true);
    expect(getFarmBillingAccess({ ...options, graceDays: 3 }).hasAccess).toBe(false);
  });

  it('anchors past_due grace on trial_ends_at when current_period_end is missing', () => {
    const nowMs = Date.parse('2027-01-08T00:00:00.000Z'); // exactly trial end
    const access = getFarmBillingAccess({
      subscription: makeSubscription({ status: 'past_due', current_period_end: null }),
      nowMs,
    });
    expect(access.hasAccess).toBe(true);
  });

  it('fails closed for past_due with no recoverable time anchor', () => {
    const access = getFarmBillingAccess({
      subscription: makeSubscription({ status: 'past_due', current_period_end: null, trial_ends_at: null }),
      nowMs: Date.now(),
    });
    expect(access.hasAccess).toBe(false);
    expect(access.phase).toBe('locked');
  });

  it('keeps canceled and unpaid access until the paid period ends', () => {
    for (const status of ['canceled', 'unpaid'] as const) {
      const within = getFarmBillingAccess({
        subscription: makeSubscription({ status }),
        nowMs: Date.parse(BEFORE_PERIOD_END),
      });
      expect(within).toEqual({ hasAccess: true, inGrace: true, phase: 'grace', status });

      const after = getFarmBillingAccess({
        subscription: makeSubscription({ status }),
        nowMs: Date.parse(AFTER_PERIOD_END),
      });
      expect(after.hasAccess).toBe(false);
      expect(after.phase).toBe('locked');
    }
  });

  it('locks incomplete checkout sessions regardless of enforcement', () => {
    for (const enforce of [false, true]) {
      const access = getFarmBillingAccess({
        subscription: makeSubscription({ status: 'incomplete' }),
        enforce,
        nowMs: Date.now(),
      });
      expect(access.hasAccess).toBe(false);
    }
  });

  it('ignores malformed timestamps instead of throwing', () => {
    const access = getFarmBillingAccess({
      subscription: makeSubscription({
        status: 'past_due',
        current_period_end: 'not-a-date',
        trial_ends_at: null,
      }),
      nowMs: Date.now(),
    });
    expect(access.hasAccess).toBe(false);
  });
});

describe('isBillingUiEnabled', () => {
  it('requires the exact string "true"', () => {
    expect(isBillingUiEnabled({ VITE_BILLING_UI_ENABLED: 'true' })).toBe(true);
    expect(isBillingUiEnabled({ VITE_BILLING_UI_ENABLED: 'True' })).toBe(false);
    expect(isBillingUiEnabled({ VITE_BILLING_UI_ENABLED: '1' })).toBe(false);
    expect(isBillingUiEnabled({})).toBe(false);
    expect(isBillingUiEnabled(undefined as unknown as Record<string, string | undefined>)).toBe(false);
  });
});

describe('billing allowlist', () => {
  it('parses a comma-separated allowlist case-insensitively', () => {
    expect(parseBillingAllowlist(' Owner@Example.com , user-2 ,,')).toEqual([
      'owner@example.com',
      'user-2',
    ]);
    expect(parseBillingAllowlist(undefined)).toEqual([]);
    expect(parseBillingAllowlist('')).toEqual([]);
  });

  it('matches either the email or the user id', () => {
    const raw = 'owner@example.com,user-2';
    expect(isBillingAllowlisted({ email: 'OWNER@example.com', userId: 'other' }, raw)).toBe(true);
    expect(isBillingAllowlisted({ email: null, userId: 'USER-2' }, raw)).toBe(true);
    expect(isBillingAllowlisted({ email: 'nope@example.com', userId: 'user-3' }, raw)).toBe(false);
  });

  it('denies everyone when the allowlist is empty or identity is missing', () => {
    expect(isBillingAllowlisted({ email: 'owner@example.com', userId: 'user-1' }, '')).toBe(false);
    expect(isBillingAllowlisted({ email: 'owner@example.com' }, undefined)).toBe(false);
    expect(isBillingAllowlisted(null, 'owner@example.com')).toBe(false);
  });
});

describe('requestBillingSession', () => {
  it('posts with the bearer token and returns the hosted Stripe url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/test' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const url = await requestBillingSession('checkout', { accessToken: 'token-1' });
    expect(url).toBe('https://checkout.stripe.com/c/pay/test');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/create-checkout-session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('targets the portal endpoint and trims trailing slashes from the base', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://billing.stripe.com/session/test' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await requestBillingSession('portal', { accessToken: 't', apiBase: 'https://app.example.com/api/' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/api/create-portal-session',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });

  it('surfaces the server error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Billing is coming soon.' }), { status: 403 }),
      ),
    );
    await expect(requestBillingSession('checkout', { accessToken: 't' })).rejects.toThrow(
      'Billing is coming soon.',
    );
    vi.unstubAllGlobals();
  });

  it('rejects non-https redirect targets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'javascript:alert(1)' }), { status: 200 })),
    );
    await expect(requestBillingSession('checkout', { accessToken: 't' })).rejects.toThrow(
      'Billing returned an unexpected response',
    );
    vi.unstubAllGlobals();
  });
});
