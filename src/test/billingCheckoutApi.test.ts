import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: { create: mocks.createCheckoutSession } };
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

describe('create checkout session API', () => {
  beforeEach(() => {
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
                : { data: null, error: null },
            ),
          }),
        }),
      })),
    });
    mocks.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('uses a farm-scoped idempotency key for repeated initial requests', async () => {
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
      expect.objectContaining({ client_reference_id: 'farm-1' }),
      { idempotencyKey: 'acreledger-checkout:farm-1:initial' },
    );
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
});
