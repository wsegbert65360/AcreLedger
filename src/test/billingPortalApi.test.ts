import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPortalSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    billingPortal = { sessions: { create: mocks.createPortalSession } };
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

import handler from '../../api/create-portal-session';

type RequestInput = Parameters<typeof handler>[0];
type ResponseInput = Parameters<typeof handler>[1];

function createResponse() {
  const state: { status: number; body?: unknown } = { status: 200 };
  const response: ResponseInput = {
    setHeader() { return response; },
    status(code) { state.status = code; return response; },
    json(body) { state.body = body; return response; },
    end() {},
  };
  return { response, state };
}

function createRequest(): RequestInput {
  return {
    method: 'POST',
    headers: {
      origin: 'https://acreledger.example',
      authorization: 'Bearer valid-token',
    },
    query: {},
  };
}

describe('create portal session API', () => {
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
          eq: () => table === 'profiles'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { farm_id: 'farm-1' }, error: null }) }
            : {
                is: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      owner_user_id: 'user-1',
                      stripe_customer_id: 'cus_test_1',
                      deleted_at: null,
                    },
                    error: null,
                  }),
                }),
              },
        }),
      })),
    });
    mocks.createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.test/session' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('opens Stripe Customer Portal for the farm subscription owner', async () => {
    const response = createResponse();
    await handler(createRequest(), response.response);

    expect(response.state).toMatchObject({
      status: 200,
      body: { url: 'https://billing.stripe.test/session' },
    });
    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: 'cus_test_1',
      return_url: 'https://acreledger.example/settings?billing=portal',
    });
  });

  it('fails closed when the existing subscription cannot be verified', async () => {
    const client = mocks.createClient();
    client.from = vi.fn((table: string) => ({
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
    }));
    mocks.createClient.mockReturnValue(client);
    const response = createResponse();

    await handler(createRequest(), response.response);

    expect(response.state).toMatchObject({
      status: 500,
      body: { error: 'Could not verify billing status' },
    });
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });
});
