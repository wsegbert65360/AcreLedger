import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count: number | null;
};

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: class StripeMock {
    webhooks = { constructEvent: mocks.constructEvent };
    subscriptions = { retrieve: mocks.retrieveSubscription };
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

import handler from '../../api/stripe-webhook';

type RequestInput = Parameters<typeof handler>[0];
type ResponseInput = Parameters<typeof handler>[1];

function createSupabaseClient() {
  const queues = new Map<string, QueryResult[]>();
  const calls: Array<{ table: string; operation: string; payload?: unknown; options?: unknown }> = [];

  const next = (table: string): Promise<QueryResult> => {
    const result = queues.get(table)?.shift();
    if (!result) throw new Error(`No mocked Supabase result for ${table}`);
    return Promise.resolve(result);
  };

  const client = {
    from(table: string) {
      let operation = 'query';
      const builder: Record<string, unknown> = {};
      builder.insert = (payload: unknown) => {
        operation = 'insert';
        calls.push({ table, operation, payload });
        return builder;
      };
      builder.update = (payload: unknown, options?: unknown) => {
        operation = 'update';
        calls.push({ table, operation, payload, options });
        return builder;
      };
      builder.select = () => {
        operation = 'select';
        calls.push({ table, operation });
        return builder;
      };
      builder.eq = () => builder;
      builder.is = () => builder;
      builder.maybeSingle = () => next(table);
      builder.then = (
        onFulfilled: ((result: QueryResult) => unknown) | null,
        onRejected: ((error: unknown) => unknown) | null,
      ) => next(table).then(onFulfilled, onRejected);
      return builder;
    },
  };

  return {
    client,
    calls,
    queue(table: string, ...results: QueryResult[]) {
      const existing = queues.get(table) ?? [];
      existing.push(...results);
      queues.set(table, existing);
    },
  };
}

function result(overrides: Partial<QueryResult> = {}): QueryResult {
  return { data: null, error: null, count: 1, ...overrides };
}

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

async function invoke() {
  const request: RequestInput = {
    method: 'POST',
    headers: { 'stripe-signature': 'valid-signature' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{}');
    },
  };
  const response = createResponse();
  await handler(request, response.response);
  return response.state;
}

const subscriptionEvent = {
  id: 'evt_subscription_updated',
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_current',
      status: 'past_due',
      metadata: { farm_id: 'farm-1', user_id: 'user-1' },
    },
  },
};

const currentSubscription = {
  id: 'sub_current',
  status: 'active',
  created: 1788955200,
  customer: 'cus_1',
  metadata: { farm_id: 'farm-1', user_id: 'user-1' },
  items: { data: [{ price: { id: 'price_1' } }] },
};

describe('Stripe webhook delivery recovery', () => {
  beforeEach(() => {
    process.env.BILLING_LIVE_CHARGES = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
    process.env.STRIPE_PRICE_ID = 'price_test';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    mocks.constructEvent.mockReturnValue(subscriptionEvent);
    mocks.retrieveSubscription.mockResolvedValue(currentSubscription);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('retries an event whose first processing attempt failed before processed_at was set', async () => {
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue(
      'billing_webhook_events',
      result(),
      result({ error: { code: '23505', message: 'duplicate' }, count: null }),
      result({ data: { processed_at: null }, count: null }),
      result(),
    );
    supabase.queue('farm_subscriptions', result({ count: null }), result());

    mocks.retrieveSubscription.mockRejectedValueOnce(new Error('temporary Stripe failure'));
    expect((await invoke()).status).toBe(500);
    expect((await invoke()).status).toBe(200);

    expect(
      supabase.calls.some(
        call => call.table === 'billing_webhook_events' &&
          call.operation === 'update' &&
          (call.payload as { processed_at?: string }).processed_at != null,
      ),
    ).toBe(true);
  });

  it('uses Stripe current state instead of persisting an out-of-order event snapshot', async () => {
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    supabase.queue('farm_subscriptions', result({ count: null }), result());

    expect((await invoke()).status).toBe(200);
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith('sub_current');
    const insert = supabase.calls.find(
      call => call.table === 'farm_subscriptions' && call.operation === 'insert',
    );
    expect(insert?.payload).toMatchObject({
      status: 'active',
      stripe_subscription_id: 'sub_current',
      stripe_subscription_created_at: '2026-09-09T12:00:00.000Z',
    });
  });

  it('skips only events already marked processed', async () => {
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue(
      'billing_webhook_events',
      result({ error: { code: '23505', message: 'duplicate' }, count: null }),
      result({ data: { processed_at: '2026-09-09T12:01:00.000Z' }, count: null }),
    );

    const response = await invoke();
    expect(response).toMatchObject({ status: 200, body: { received: true, duplicate: true } });
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
  });

  it('retries when the mirrored subscription update matches no row', async () => {
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result());
    supabase.queue(
      'farm_subscriptions',
      result({
        data: {
          id: 'row-1',
          owner_user_id: 'user-1',
          stripe_subscription_id: 'sub_current',
          stripe_subscription_created_at: '2026-09-09T12:00:00.000Z',
        },
        count: null,
      }),
      result({ count: 0 }),
    );

    const response = await invoke();

    expect(response.status).toBe(500);
    expect(
      supabase.calls.some(
        call => call.table === 'farm_subscriptions' &&
          call.operation === 'update' &&
          (call.options as { count?: string } | undefined)?.count === 'exact',
      ),
    ).toBe(true);
  });
});
