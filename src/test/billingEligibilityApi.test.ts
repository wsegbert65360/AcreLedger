import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

import handler from '../../api/billing-eligibility';

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
      authorization: 'Bearer valid-token',
    },
    query: {},
    ...overrides,
  };
}

describe('billing eligibility API', () => {
  beforeEach(() => {
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
  });

  it('returns allowlisted true for an allowlisted user', async () => {
    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state).toEqual({
      status: 200,
      body: { allowlisted: true },
    });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted']);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns allowlisted false when the verified user is not on the list', async () => {
    process.env.BILLING_ALLOWLIST = 'someone-else';
    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state).toEqual({
      status: 200,
      body: { allowlisted: false },
    });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted']);
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
      authorization: 'Bearer stale-token',
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
      body: { allowlisted: false },
    });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted']);
  });

  it('returns allowlisted false when BILLING_ALLOWLIST is empty or unset', async () => {
    delete process.env.BILLING_ALLOWLIST;
    const unsetResult = createResponse();
    await handler(createRequest(), unsetResult.response);
    expect(unsetResult.state).toEqual({
      status: 200,
      body: { allowlisted: false },
    });

    process.env.BILLING_ALLOWLIST = '';
    const emptyResult = createResponse();
    await handler(createRequest(), emptyResult.response);
    expect(emptyResult.state).toEqual({
      status: 200,
      body: { allowlisted: false },
    });
  });

  it('responds 200 with only the allowlisted key', async () => {
    const result = createResponse();
    await handler(createRequest(), result.response);

    expect(result.state.status).toBe(200);
    expect(result.state.body).toEqual({ allowlisted: true });
    expect(Object.keys(result.state.body as object)).toEqual(['allowlisted']);
  });
});
