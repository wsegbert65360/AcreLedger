import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const consumeRateLimit = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: authGetUser },
    rpc: consumeRateLimit,
  })),
}));

import handler from '../../api/weather-proxy';

type RequestInput = Parameters<typeof handler>[0];
type ResponseInput = Parameters<typeof handler>[1];

function createResponse() {
  const headers = new Map<string, string>();
  const state: { status: number; body?: unknown; ended: boolean } = {
    status: 200,
    ended: false,
  };
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
    end() {
      state.ended = true;
    },
  };
  return { response, headers, state };
}

async function invoke(overrides: Partial<RequestInput> = {}) {
  const request: RequestInput = {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
    query: { location: '40,-90' },
    ...overrides,
  };
  const result = createResponse();
  await handler(request, result.response);
  return result;
}

describe('weather proxy', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.VISUALCROSSING_API_KEY = 'weather-key';
    process.env.ALLOWED_ORIGINS = 'https://acreledger.example,capacitor://localhost';
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    consumeRateLimit.mockResolvedValue({ data: true, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue({ days: [] }),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('rejects missing authorization', async () => {
    const { state } = await invoke({ headers: {} });
    expect(state.status).toBe(401);
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const { state } = await invoke();
    expect(state.status).toBe(401);
  });

  it('rejects unsupported methods before calling upstream', async () => {
    const { state } = await invoke({ method: 'POST' });
    expect(state.status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers preflight for a configured origin without authenticating', async () => {
    const { state, headers } = await invoke({
      method: 'OPTIONS',
      headers: { origin: 'https://acreledger.example' },
    });
    expect(state.status).toBe(204);
    expect(state.ended).toBe(true);
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://acreledger.example');
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it('fails closed for an unlisted origin', async () => {
    const { state, headers } = await invoke({
      headers: { origin: 'https://attacker.example', authorization: 'Bearer valid-token' },
    });
    expect(state.status).toBe(403);
    expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it('fails closed when the origin allowlist is missing', async () => {
    delete process.env.ALLOWED_ORIGINS;
    const { state } = await invoke({
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
    });
    expect(state.status).toBe(403);
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it('allows a configured origin and varies the response by origin', async () => {
    const { state, headers } = await invoke({
      headers: { origin: 'https://acreledger.example', authorization: 'Bearer valid-token' },
    });
    expect(state.status).toBe(200);
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://acreledger.example');
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('rejects unknown and repeated query parameters', async () => {
    const unknown = await invoke({ query: { location: '40,-90', surprise: 'yes' } });
    expect(unknown.state.status).toBe(400);

    const repeated = await invoke({ query: { location: '40,-90', include: ['days', 'hours'] } });
    expect(repeated.state.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 429 without calling upstream when the quota is exhausted', async () => {
    consumeRateLimit.mockResolvedValue({ data: false, error: null });
    const { state, headers } = await invoke();
    expect(state.status).toBe(429);
    expect(headers.get('Retry-After')).toBe('60');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the durable quota cannot be checked', async () => {
    consumeRateLimit.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } });
    const { state } = await invoke();
    expect(state.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves upstream status and JSON', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 429,
      json: vi.fn().mockResolvedValue({ message: 'upstream quota' }),
    } as unknown as Response);
    const { state } = await invoke();
    expect(state.status).toBe(429);
    expect(state.body).toEqual({ message: 'upstream quota' });
  });

  it('returns 504 when the upstream request times out', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));

    const pending = invoke();
    await vi.advanceTimersByTimeAsync(10_000);
    const { state } = await pending;
    expect(state.status).toBe(504);
  });

  it('returns 502 for non-timeout upstream failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));
    const { state } = await invoke();
    expect(state.status).toBe(502);
  });
});
