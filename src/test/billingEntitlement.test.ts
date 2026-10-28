import { Capacitor } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearBillingEligibilityCache,
  fetchBillingEligibility,
  getCachedBillingEligibility,
  getFarmBillingAccess,
  isBillingUiAvailable,
  isBillingUiEnabled,
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
    stripe_subscription_created_at: '2026-09-09T00:00:00.000Z',
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

describe('isBillingUiAvailable', () => {
  it('hides billing on native even when the UI flag is on', () => {
    const spy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    try {
      expect(isBillingUiAvailable({ VITE_BILLING_UI_ENABLED: 'true' })).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('is available on web only when the UI flag is exactly true', () => {
    const spy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    try {
      expect(isBillingUiAvailable({ VITE_BILLING_UI_ENABLED: 'true' })).toBe(true);
      expect(isBillingUiAvailable({ VITE_BILLING_UI_ENABLED: 'false' })).toBe(false);
      expect(isBillingUiAvailable({})).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('fetchBillingEligibility', () => {
  afterEach(() => {
    clearBillingEligibilityCache();
    vi.unstubAllGlobals();
  });

  it('returns true when the server reports allowlisted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowlisted: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' }),
    ).resolves.toEqual({ allowlisted: true, checkoutEnabled: false, liveCharges: false });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing-eligibility',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('carries and caches public capabilities, defaulting absent fields to false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowlisted: true, checkoutEnabled: true, liveCharges: false }), { status: 200 })));
    const expected = { allowlisted: true, checkoutEnabled: true, liveCharges: false };
    expect(await fetchBillingEligibility({ userId: 'test-mode-user', accessToken: 'token' })).toEqual(expected);
    expect(getCachedBillingEligibility('test-mode-user')).toEqual(expected);
  });
  it.each([true, 'true'])('ignores checkout and live charges for non-allowlisted responses (%s)', async liveCharges => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowlisted: false, checkoutEnabled: true, liveCharges }), { status: 200 })));
    expect(await fetchBillingEligibility({ userId: 'non-allowed', accessToken: 'token' })).toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
  });

  it('returns false when the server reports not allowlisted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ allowlisted: false }), { status: 200 }),
      ),
    );

    await expect(
      fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' }),
    ).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
  });

  it('fails closed on a non-2xx response, bad JSON, or a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ allowlisted: true }), { status: 500 }),
      ),
    );
    await expect(
      fetchBillingEligibility({ userId: 'user-a', accessToken: 't' }),
    ).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });

    clearBillingEligibilityCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));
    await expect(
      fetchBillingEligibility({ userId: 'user-b', accessToken: 't' }),
    ).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });

    clearBillingEligibilityCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(
      fetchBillingEligibility({ userId: 'user-c', accessToken: 't' }),
    ).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
  });

  it('does not reuse a cached answer for a different user id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ allowlisted: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ allowlisted: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' }),
    ).resolves.toEqual({ allowlisted: true, checkoutEnabled: false, liveCharges: false });
    expect(getCachedBillingEligibility('user-1')).toEqual({ allowlisted: true, checkoutEnabled: false, liveCharges: false });
    expect(getCachedBillingEligibility('user-2')).toBeUndefined();
    await expect(
      fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' }),
    ).resolves.toEqual({ allowlisted: true, checkoutEnabled: false, liveCharges: false });
    await expect(
      fetchBillingEligibility({ userId: 'user-2', accessToken: 'token-2' }),
    ).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
    expect(getCachedBillingEligibility('user-2')).toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
    expect(getCachedBillingEligibility('user-1')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache an aborted in-flight eligibility request', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener('abort', abort, { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchBillingEligibility({
      userId: 'user-1',
      accessToken: 'token-1',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
    expect(getCachedBillingEligibility('user-1')).toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowlisted: true }), { status: 200 })),
    );
    await expect(
      fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' }),
    ).resolves.toEqual({ allowlisted: true, checkoutEnabled: false, liveCharges: false });
  });

  it('clearBillingEligibilityCache drops a late in-flight result', async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () => new Promise<Response>(resolve => {
          finish = resolve;
        }),
      ),
    );

    const pending = fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' });
    clearBillingEligibilityCache();
    finish(new Response(JSON.stringify({ allowlisted: true }), { status: 200 }));
    await expect(pending).resolves.toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
    expect(getCachedBillingEligibility('user-1')).toBeUndefined();
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
