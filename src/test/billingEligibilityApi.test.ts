import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

import handler from '../../api/billing-eligibility';

/** Three non-empty base64url segments so the request passes the JWT shape gate. */
const WELL_FORMED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig';

type RequestInput = Parameters<typeof handler>[0];
type ResponseInput = Parameters<typeof handler>[1];

function createResponse() {
  const headers = new Map<string, string>();
  const state: { status: number; body?: unknown } = { status: 200 };
  const response: ResponseInput = {
    setHeader(name, value) {
      headers.set(name, value);
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
  return { response, headers, state };
}

function createRequest(overrides: Partial<RequestInput> = {}): RequestInput {
  return {
    method: 'GET',
    headers: {
      origin: 'https://acreledger.example',
      authorization: `Bearer ${WELL_FORMED_TOKEN}`,
    },
    query: {},
    ...overrides,
  };
}

describe('billing eligibility API', () => {
  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.BILLING_LIVE_CHARGES;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.ALLOWED_ORIGINS = 'https://acreledger.example';
    process.env.BILLING_ALLOWLIST = 'user-1,farmer@example.com';

    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'farmer@example.com' } },
          error: null,
        }),
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.BILLING_ALLOWLIST;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.BILLING_LIVE_CHARGES;
  });

  it('returns allowlisted true for an allowlisted user', async () => {
    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state).toEqual({
      status: 200,
      body: { allowlisted: true, checkoutEnabled: false, liveCharges: false },
    });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted', 'checkoutEnabled', 'liveCharges']);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns allowlisted false when the verified user is not on the list', async () => {
    process.env.BILLING_ALLOWLIST = 'someone-else';
    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state).toEqual({
      status: 200,
      body: { allowlisted: false, checkoutEnabled: false, liveCharges: false },
    });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted', 'checkoutEnabled', 'liveCharges']);
  });

  it.each([
    ['not three segments', 'not-a-jwt'],
    ['two segments', 'only.two'],
    ['four segments', 'a.b.c.d'],
    ['empty middle segment', 'a..c'],
    ['empty first segment', '.b.c'],
    ['empty last segment', 'a.b.'],
    ['non-base64url character', 'ab+c.def.ghi'],
    ['base64 padding', 'abc.def.ghi='],
  ])('returns 401 for a garbage bearer token (%s) before the Supabase config check', async (_label, token) => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const result = createResponse();
    await handler(
      createRequest({
        headers: {
          origin: 'https://acreledger.example',
          authorization: `Bearer ${token}`,
        },
      }),
      result.response,
    );

    expect(result.state).toEqual({
      status: 401,
      body: { error: 'Missing or invalid authorization header' },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns 401 for an oversized bearer token before the Supabase config check', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const result = createResponse();
    await handler(
      createRequest({
        headers: {
          origin: 'https://acreledger.example',
          authorization: `Bearer ${'a'.repeat(4000)}.${'b'.repeat(4000)}.${'c'.repeat(4000)}`,
        },
      }),
      result.response,
    );

    expect(result.state).toEqual({
      status: 401,
      body: { error: 'Missing or invalid authorization header' },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns 500 when Supabase config is missing for a well-formed bearer token', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state).toEqual({
      status: 500,
      body: { error: 'Server configuration error' },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is missing', async () => {
    const result = createResponse();
    await handler(
      createRequest({ headers: { origin: 'https://acreledger.example' } }),
      result.response,
    );

    expect(result.state).toMatchObject({
      status: 401,
      body: { error: 'Missing or invalid authorization header' },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is invalid', async () => {
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'JWT expired' },
        }),
      },
    });
    const result = createResponse();
    await handler(createRequest({ headers: {
      origin: 'https://acreledger.example',
      authorization: `Bearer ${WELL_FORMED_TOKEN}`,
    } }), result.response);

    expect(result.state).toMatchObject({
      status: 401,
      body: { error: 'Invalid or expired token' },
    });
    expect(console.error).toHaveBeenCalledWith('JWT expired');
  });

  it('ignores email and userId in query or body and uses only the token identity', async () => {
    process.env.BILLING_ALLOWLIST = 'intruder@example.com,intruder-id';
    const result = createResponse();
    await handler(
      createRequest({
        query: { email: 'intruder@example.com', userId: 'intruder-id' },
        body: { email: 'intruder@example.com', userId: 'intruder-id' },
      }),
      result.response,
    );

    expect(result.state).toEqual({
      status: 200,
      body: { allowlisted: false, checkoutEnabled: false, liveCharges: false },
    });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted', 'checkoutEnabled', 'liveCharges']);
  });

  it('returns allowlisted false when BILLING_ALLOWLIST is empty or unset', async () => {
    delete process.env.BILLING_ALLOWLIST;
    const unsetResult = createResponse();
    await handler(createRequest(), unsetResult.response);
    expect(unsetResult.state).toEqual({
      status: 200,
      body: { allowlisted: false, checkoutEnabled: false, liveCharges: false },
    });

    process.env.BILLING_ALLOWLIST = '';
    const emptyResult = createResponse();
    await handler(createRequest(), emptyResult.response);
    expect(emptyResult.state).toEqual({
      status: 200,
      body: { allowlisted: false, checkoutEnabled: false, liveCharges: false },
    });
  });

  it('responds 200 with only public billing booleans', async () => {
    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state.status).toBe(200);
    expect(result.state.body).toEqual({ allowlisted: true, checkoutEnabled: false, liveCharges: false });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted', 'checkoutEnabled', 'liveCharges']);
  });
  it.each([
    ['sk_test_trial_fixture', undefined, true, false],
    ['sk_live_trial_fixture', 'false', false, false],
    ['sk_live_trial_fixture', 'TrUe', false, true],
    ['', undefined, false, false],
    ['sk_live_trial_fixture', ' true ', false, true],
  ])('returns safe capabilities for configured billing', async (key, live, checkoutEnabled, liveCharges) => {
    process.env.STRIPE_SECRET_KEY = key;
    if (live !== undefined) process.env.BILLING_LIVE_CHARGES = live;
    const result = createResponse();
    await handler(createRequest(), result.response);
    expect(result.state.body).toEqual({ allowlisted: true, checkoutEnabled, liveCharges });
    const body = JSON.stringify(result.state.body);
    if (key) expect(body).not.toContain(key);
    expect(body).not.toContain('sk_');
    expect(console.error).not.toHaveBeenCalled();
  });
  it('never enables checkout for a non-allowlisted user, even with test or live billing', async () => {
    process.env.BILLING_ALLOWLIST = 'someone-else';
    process.env.STRIPE_SECRET_KEY = 'sk_test_trial_fixture';
    process.env.BILLING_LIVE_CHARGES = 'true';
    const result = createResponse();
    await handler(createRequest(), result.response);
    expect(result.state.body).toEqual({ allowlisted: false, checkoutEnabled: false, liveCharges: false });
  });

});
