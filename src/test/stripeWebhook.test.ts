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

import handler, { readRawBody } from '../../api/stripe-webhook';

type RequestInput = Parameters<typeof handler>[0];
type ResponseInput = Parameters<typeof handler>[1];

function createSupabaseClient() {
  const queues = new Map<string, QueryResult[]>();
  const calls: Array<{
    table: string;
    operation: string;
    payload?: unknown;
    options?: unknown;
    filters?: Array<{ kind: 'eq' | 'is'; column: string; value: unknown }>;
  }> = [];

  const next = (table: string): Promise<QueryResult> => {
    const result = queues.get(table)?.shift();
    if (!result) throw new Error(`No mocked Supabase result for ${table}`);
    return Promise.resolve(result);
  };

  const client = {
    rpc(name: string, payload: unknown) {
      calls.push({ table: `rpc:${name}`, operation: 'rpc', payload, filters: [] });
      return next(`rpc:${name}`);
    },
    from(table: string) {
      let operation = 'query';
      const filters: Array<{ kind: 'eq' | 'is'; column: string; value: unknown }> = [];
      const builder: Record<string, unknown> = {};
      builder.insert = (payload: unknown) => {
        operation = 'insert';
        calls.push({ table, operation, payload, filters });
        return builder;
      };
      builder.update = (payload: unknown, options?: unknown) => {
        operation = 'update';
        calls.push({ table, operation, payload, options, filters });
        return builder;
      };
      builder.select = () => {
        operation = 'select';
        calls.push({ table, operation, filters });
        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        filters.push({ kind: 'eq', column, value });
        return builder;
      };
      builder.is = (column: string, value: unknown) => {
        filters.push({ kind: 'is', column, value });
        return builder;
      };
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

async function invoke(signature: string | null = 'valid-signature') {
  const request: RequestInput = {
    method: 'POST',
    headers: signature == null ? {} : { 'stripe-signature': signature },
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

  it('preserves the exact streamed request bytes used for signature verification', async () => {
    const request = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('{"a":');
        yield Buffer.from(' 1}\n');
      },
    } as RequestInput;
    await expect(readRawBody(request)).resolves.toEqual(Buffer.from('{"a": 1}\n'));
  });

  it('rejects a missing Stripe signature before creating a database client', async () => {
    const response = await invoke(null);

    expect(response).toMatchObject({
      status: 400,
      body: { error: 'Missing stripe-signature header' },
    });
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects an invalid Stripe signature before creating a database client', async () => {
    mocks.constructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const response = await invoke('invalid-signature');

    expect(response).toMatchObject({
      status: 400,
      body: { error: 'Invalid webhook signature or payload' },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects live-mode events while live charges are disabled', async () => {
    mocks.constructEvent.mockReturnValueOnce({ ...subscriptionEvent, livemode: true });
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns a retryable conflict while another worker holds a fresh event lease', async () => {
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue(
      'billing_webhook_events',
      result({ error: { code: '23505', message: 'duplicate' }, count: null }),
      result({ data: { processed_at: null, claimed_at: new Date().toISOString() }, count: null }),
    );
    expect((await invoke()).status).toBe(409);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
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
    supabase.queue(
      'farm_subscriptions',
      result({
        data: {
          id: 'row-1',
          owner_user_id: 'user-1',
          stripe_subscription_id: 'sub_current',
          stripe_subscription_created_at: '2026-09-09T12:00:00.000Z',
          updated_at: '2026-09-09T11:59:00.000Z',
        },
        count: null,
      }),
      result(),
    );

    expect((await invoke()).status).toBe(200);
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith('sub_current');
    const update = supabase.calls.find(
      call => call.table === 'farm_subscriptions' && call.operation === 'update',
    );
    expect(update?.payload).toMatchObject({
      status: 'active',
      stripe_subscription_id: 'sub_current',
      stripe_subscription_created_at: '2026-09-09T12:00:00.000Z',
    });
  });

  it('does not grant a metadata-only subscription.created event', async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_created',
      type: 'customer.subscription.created',
      data: { object: { ...currentSubscription, status: 'trialing' } },
    });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    supabase.queue('farm_subscriptions', result({ count: null }));

    expect((await invoke()).status).toBe(200);
    expect(
      supabase.calls.some(call => call.table === 'farm_subscriptions' && call.operation === 'insert'),
    ).toBe(false);
  });

  it('rejects checkout metadata whose user is not a member of the farm', async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_current',
          mode: 'subscription',
          client_reference_id: 'farm-1',
          metadata: { farm_id: 'farm-1', user_id: 'user-outsider' },
        },
      },
    });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    supabase.queue('farm_subscriptions', result({ count: null }));
    supabase.queue('profiles', result({ count: null }));

    expect((await invoke()).status).toBe(200);
    expect(
      supabase.calls.some(call => call.table === 'farm_subscriptions' && call.operation === 'insert'),
    ).toBe(false);
  });

  it('ignores completed Checkout that does not reference the metadata farm', async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_mismatched_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_current',
          mode: 'subscription',
          client_reference_id: 'farm-other',
          metadata: { farm_id: 'farm-1', user_id: 'user-1' },
        },
      },
    });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());

    expect((await invoke()).status).toBe(200);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
  });

  it('reads the legacy top-level invoice subscription id', async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      data: { object: { subscription: 'sub_legacy' } },
    });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    supabase.queue('farm_subscriptions', result({ count: null }));

    expect((await invoke()).status).toBe(200);
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith('sub_legacy');
  });

  it('reads the basil invoice shape and anchors past_due at the failure event', async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      created: 1790000000,
      data: { object: { parent: { subscription_details: { subscription: 'sub_current' } } } },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce({ ...currentSubscription, status: 'past_due' });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    supabase.queue(
      'farm_subscriptions',
      result({ data: {
        id: 'row-1', owner_user_id: 'user-1', status: 'active',
        stripe_subscription_id: 'sub_current',
        stripe_subscription_created_at: '2026-09-09T12:00:00.000Z',
        past_due_since: null, updated_at: '2026-09-09T12:00:00.000Z',
      }, count: null }),
      result(),
    );
    expect((await invoke()).status).toBe(200);
    const update = supabase.calls.find(call =>
      call.table === 'farm_subscriptions' && call.operation === 'update');
    expect(update?.payload).toMatchObject({
      status: 'past_due',
      past_due_since: '2026-09-21T14:13:20.000Z',
    });
  });

  it('acknowledges a permanently missing Stripe resource and records the reason', async () => {
    mocks.retrieveSubscription.mockRejectedValueOnce({ code: 'resource_missing' });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    expect((await invoke()).status).toBe(200);
    const finalize = supabase.calls.find(call =>
      call.table === 'billing_webhook_events' && call.operation === 'update');
    expect(finalize?.payload).toMatchObject({
      outcome: 'ignored', reason: 'stripe_resource_missing',
    });
  });

  it('soft-deletes history and inserts a completed non-live replacement via one RPC', async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_checkout_replacement',
      type: 'checkout.session.completed',
      data: { object: {
        subscription: 'sub_new', mode: 'subscription', client_reference_id: 'farm-1',
        metadata: { farm_id: 'farm-1', user_id: 'user-1' },
      } },
    });
    mocks.retrieveSubscription.mockResolvedValueOnce({
      ...currentSubscription, id: 'sub_new', created: 1788955300, status: 'active',
    });
    const supabase = createSupabaseClient();
    mocks.createClient.mockReturnValue(supabase.client);
    supabase.queue('billing_webhook_events', result(), result());
    supabase.queue('farm_subscriptions', result({ data: {
      id: 'row-old', owner_user_id: 'user-1', status: 'canceled',
      stripe_subscription_id: 'sub_old',
      stripe_subscription_created_at: '2026-09-09T12:00:00.000Z',
      past_due_since: null, updated_at: '2026-09-09T12:01:00.000Z',
    }, count: null }));
    supabase.queue('profiles', result({ data: { id: 'user-1' }, count: null }));
    supabase.queue('rpc:replace_farm_subscription', result());
    expect((await invoke()).status).toBe(200);
    expect(supabase.calls).toContainEqual(expect.objectContaining({
      table: 'rpc:replace_farm_subscription', operation: 'rpc',
    }));
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
          updated_at: '2026-09-09T12:01:00.000Z',
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
    const update = supabase.calls.find(
      call => call.table === 'farm_subscriptions' && call.operation === 'update',
    );
    expect(update?.filters).toEqual(expect.arrayContaining([
      { kind: 'eq', column: 'stripe_subscription_id', value: 'sub_current' },
      {
        kind: 'eq',
        column: 'stripe_subscription_created_at',
        value: '2026-09-09T12:00:00.000Z',
      },
      { kind: 'eq', column: 'updated_at', value: '2026-09-09T12:01:00.000Z' },
    ]));
  });
});
