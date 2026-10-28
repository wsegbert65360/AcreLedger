import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  searchSubscriptions: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: { create: mocks.createCheckoutSession } };
    subscriptions = { search: mocks.searchSubscriptions };
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

import handler from '../../api/create-checkout-session';

type RequestInput = Parameters<typeof handler>[0];
type ResponseInput = Parameters<typeof handler>[1];

function createResponse() {
  const state: { status: number; body?: unknown } = { status: 200 };
  const response: ResponseInput = {
    setHeader() {
      return response;
    },
    status(code) {
      state.status = code;
      return response;
    },
    json(body) {
      state.body = body;
      return response;
    },
    end() {},
  };
  return { response, state };
}

let farmTrialEndsAt: string | null;
let farmLookupError: { message: string } | null;

describe('create checkout session API', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T12:00:00Z'));
    farmTrialEndsAt = '2026-11-01T12:00:00Z';
    farmLookupError = null;
    process.env.BILLING_LIVE_CHARGES = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
    process.env.STRIPE_PRICE_ID = 'price_test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.ALLOWED_ORIGINS = 'https://acreledger.example';
    process.env.BILLING_ALLOWLIST = 'user-1';

    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue(
              table === 'profiles'
                ? { data: { id: 'user-1', farm_id: 'farm-1' }, error: null }
                : { data: { trial_ends_at: farmTrialEndsAt }, error: farmLookupError },
            ),
          }),
        }),
      })),
    });
    mocks.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    mocks.searchSubscriptions.mockResolvedValue({ data: [] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates the configured annual checkout with the existing farm deadline and farm-scoped idempotency', async () => {
    const request: RequestInput = {
      method: 'POST',
      headers: {
        origin: 'https://acreledger.example',
        authorization: 'Bearer valid-token',
      },
      query: {},
    };
    const response = createResponse();

    await handler(request, response.response);

    expect(response.state.status).toBe(200);
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        payment_method_collection: 'always',
        line_items: [{ price: 'price_test', quantity: 1 }],
        subscription_data: {
          trial_end: Date.parse(farmTrialEndsAt!) / 1000,
          metadata: { farm_id: 'farm-1', user_id: 'user-1' },
        },
        metadata: { farm_id: 'farm-1', user_id: 'user-1' },
        client_reference_id: 'farm-1',
        customer_email: 'farmer@example.com',
        success_url: 'https://acreledger.example/settings?billing=success',
        cancel_url: 'https://acreledger.example/settings?billing=cancelled',
      }),
      { idempotencyKey: expect.stringMatching(/^acreledger-checkout:farm-1:initial:[0-9a-z]+$/) },
    );
  });

  it.each(['2026-10-27T12:00:00Z', '2026-10-26T12:00:00Z', '2026-10-24T12:00:00Z', null])('creates no trial when the server deadline is %s', async deadline => {
    farmTrialEndsAt = deadline;
    const result = createResponse();
    await handler({ method: 'POST', headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' }, query: {} }, result.response);
    expect(result.state.status).toBe(200);
    const params = mocks.createCheckoutSession.mock.calls[0][0];
    expect(params.subscription_data).not.toHaveProperty('trial_end');
    expect(params.subscription_data).not.toHaveProperty('trial_period_days');
  });
  it('fails closed when the farm deadline cannot be read', async () => {
    farmLookupError = { message: 'read failed' };
    const result = createResponse();
    await handler({ method: 'POST', headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' }, query: {} }, result.response);
    expect(result.state.status).toBe(500);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('cleans quoted or padded Supabase env values before creating the client', async () => {
    process.env.SUPABASE_URL = ' "https://example.supabase.co" ';
    process.env.SUPABASE_ANON_KEY = " 'anon-key' ";
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.anything(),
    );
  });

  it('denies a caller missing from the server allowlist before reading billing state', async () => {
    process.env.BILLING_ALLOWLIST = 'someone-else';
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer token' },
      query: {},
    }, response.response);

    expect(response.state).toMatchObject({
      status: 403,
      body: { error: 'Billing is coming soon.' },
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('denies checkout when the active billing row belongs to another farm member', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => table === 'profiles'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { farm_id: 'farm-1' }, error: null }) }
            : {
                is: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      owner_user_id: 'user-2',
                      status: 'active',
                      deleted_at: null,
                      stripe_subscription_id: 'sub-owner-2',
                    },
                    error: null,
                  }),
                }),
              },
        }),
      })),
    });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer token' },
      query: {},
    }, response.response);

    expect(response.state).toMatchObject({
      status: 403,
      body: { error: 'Only the farm owner can start billing.' },
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('returns the unchanged 401 and logs the auth diagnostic when getUser fails', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'JWT expired' },
        }),
      },
      from: vi.fn(),
    });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer stale-token' },
      query: {},
    }, response.response);

    expect(response.state).toMatchObject({
      status: 401,
      body: { error: 'Invalid or expired token' },
    });
    expect(console.error).toHaveBeenCalledWith('JWT expired');
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('fails closed when the caller profile cannot be read', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'profile database unavailable' },
            }),
          }),
        }),
      })),
    });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state).toMatchObject({
      status: 500,
      body: { error: 'Could not resolve billing account' },
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('fails closed when the existing subscription cannot be verified', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => table === 'profiles'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { farm_id: 'farm-1' }, error: null }) }
            : {
                is: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'subscription database unavailable' },
                  }),
                }),
              },
        }),
      })),
    });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state).toMatchObject({
      status: 500,
      body: { error: 'Could not verify billing status' },
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
  it('reuses the existing customer and skips the trial when re-subscribing after a cancellation', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => table === 'farms'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { trial_ends_at: '2026-10-24T12:00:00Z' }, error: null }) }
            : table === 'profiles'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { farm_id: 'farm-1' }, error: null }) }
            : {
                is: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      owner_user_id: 'user-1',
                      status: 'canceled',
                      deleted_at: null,
                      stripe_subscription_id: 'sub_old',
                      stripe_customer_id: 'cus_old',
                    },
                    error: null,
                  }),
                }),
              },
        }),
      })),
    });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state.status).toBe(200);
    const params = mocks.createCheckoutSession.mock.calls[0][0] as Record<string, unknown>;
    expect(params.customer).toBe('cus_old');
    expect(params).not.toHaveProperty('customer_email');
    expect(params.subscription_data).toEqual({ metadata: { farm_id: 'farm-1', user_id: 'user-1' } });
  });

  it('sends a past_due owner to the portal instead of creating a second subscription', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => table === 'profiles'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { farm_id: 'farm-1' }, error: null }) }
            : {
                is: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      owner_user_id: 'user-1',
                      status: 'past_due',
                      deleted_at: null,
                      stripe_subscription_id: 'sub_live',
                      stripe_customer_id: 'cus_live',
                    },
                    error: null,
                  }),
                }),
              },
        }),
      })),
    });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state.status).toBe(409);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuses when Stripe already shows a live subscription for the farm (no mirrored row yet)', async () => {
    mocks.searchSubscriptions.mockResolvedValue({ data: [{ id: 'sub_new', status: 'trialing' }] });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state.status).toBe(409);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('ignores canceled Stripe subscriptions when checking for a live one', async () => {
    mocks.searchSubscriptions.mockResolvedValue({ data: [{ id: 'sub_old', status: 'canceled' }] });
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state.status).toBe(200);
    expect(mocks.createCheckoutSession).toHaveBeenCalled();
  });

  it('fails closed when the Stripe subscription lookup errors', async () => {
    mocks.searchSubscriptions.mockRejectedValue(new Error('stripe down'));
    const response = createResponse();

    await handler({
      method: 'POST',
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
      query: {},
    }, response.response);

    expect(response.state.status).toBe(502);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});
