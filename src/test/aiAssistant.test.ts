import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUser = vi.fn();
const consumeRpc = vi.fn();
const finalizeRpc = vi.fn();
const profilesMaybeSingle = vi.fn();
const createClientMock = vi.fn();
const fromTables: string[] = [];

const toolMocks = vi.hoisted(() => ({
  executeNamedTool: vi.fn(),
  actualExecute: undefined as undefined | ((...args: never[]) => Promise<unknown>),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('../../api/ai-assistant-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/ai-assistant-tools')>();
  toolMocks.actualExecute = actual.executeNamedTool as typeof toolMocks.actualExecute;
  toolMocks.executeNamedTool.mockImplementation(actual.executeNamedTool);
  return {
    ...actual,
    executeNamedTool: (...args: Parameters<typeof actual.executeNamedTool>) =>
      toolMocks.executeNamedTool(...args),
  };
});

const executeNamedTool = toolMocks.executeNamedTool;

import handler from '../../api/ai-assistant';

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

const defaultBody = {
  question: 'What is in my bins?',
  viewingSeason: 2026,
};

async function invoke(overrides: Partial<RequestInput> = {}) {
  const request: RequestInput = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: defaultBody,
    ...overrides,
  };
  const result = createResponse();
  await handler(request, result.response);
  return result;
}

function openRouterMessage(text: string, finishReason = 'stop'): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [
        {
          finish_reason: finishReason,
          type: 'message',
          message: { role: 'assistant', content: text },
        },
      ],
    }),
  } as unknown as Response;
}

function openRouterJson(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

function openRouterToolCalls(
  calls: Array<{ id: string; name: string; arguments?: string }>,
  reasoningDetails?: unknown[],
): Response {
  return openRouterJson({
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        tool_calls: calls.map(call => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments ?? '{}' },
        })),
        ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
      },
    }],
  });
}

function fetchBodies(): Array<Record<string, unknown>> {
  return vi.mocked(fetch).mock.calls.map(([, init]) => {
    const body = typeof init === 'object' && init && 'body' in init ? init.body : undefined;
    return JSON.parse(String(body)) as Record<string, unknown>;
  });
}

describe('ai assistant proxy', () => {
  beforeEach(() => {
    fromTables.length = 0;
    if (toolMocks.actualExecute) {
      executeNamedTool.mockImplementation(toolMocks.actualExecute);
    }
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-key';
    process.env.ALLOWED_ORIGINS = 'https://acreledger.example,capacitor://localhost';
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    consumeRpc.mockResolvedValue({ data: { allowed: true, turn_id: 'turn-1' }, error: null });
    finalizeRpc.mockResolvedValue({ data: true, error: null });
    profilesMaybeSingle.mockResolvedValue({
      data: { farm_id: 'farm-1', active_season: 2026 },
      error: null,
    });
    createClientMock.mockImplementation((url: string, key: string, options: unknown) => ({
      url,
      key,
      options,
      auth: { getUser: authGetUser },
      rpc: vi.fn((name: string, args: unknown) => {
        if (name === 'consume_ai_assistant_request') return consumeRpc(args);
        if (name === 'finalize_ai_assistant_turn') return finalizeRpc(args);
        return Promise.resolve({ data: null, error: { message: 'unknown rpc' } });
      }),
      from: vi.fn((table: string) => {
        fromTables.push(table);
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: profilesMaybeSingle,
              }),
            }),
          };
        }
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        builder.select = () => self();
        builder.eq = () => self();
        builder.is = () => self();
        builder.ilike = () => self();
        builder.not = () => self();
        builder.or = () => self();
        builder.order = () => self();
        builder.limit = () => self();
        builder.range = () => self();
        builder.then = (onFulfilled: ((value: { data: unknown; error: null }) => unknown) | null) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled);
        return builder;
      }),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(openRouterMessage('I cannot delete or change records.')));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    executeNamedTool.mockClear();
  });

  it('rejects missing authorization', async () => {
    const { state } = await invoke({ headers: {} });
    expect(state.status).toBe(401);
    expect(authGetUser).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(consumeRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const { state } = await invoke();
    expect(state.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(consumeRpc).not.toHaveBeenCalled();
  });

  it('rejects GET before calling upstream', async () => {
    const { state } = await invoke({ method: 'GET' });
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

  it('returns 400 for an empty or oversized question without consuming quota', async () => {
    const empty = await invoke({ body: { question: '   ', viewingSeason: 2026 } });
    expect(empty.state.status).toBe(400);
    const oversized = await invoke({ body: { question: 'x'.repeat(501), viewingSeason: 2026 } });
    expect(oversized.state.status).toBe(400);
    expect(consumeRpc).not.toHaveBeenCalled();
  });

  it('returns 400 for history that is not complete user/assistant pairs', async () => {
    const startsAssistant = await invoke({
      body: { question: 'Hi', viewingSeason: 2026, history: [{ role: 'assistant', content: 'Hello' }] },
    });
    expect(startsAssistant.state.status).toBe(400);

    const odd = await invoke({
      body: { question: 'Hi', viewingSeason: 2026, history: [{ role: 'user', content: 'Earlier' }] },
    });
    expect(odd.state.status).toBe(400);

    const trailingUser = await invoke({
      body: {
        question: 'Hi',
        viewingSeason: 2026,
        history: [
          { role: 'user', content: 'One' },
          { role: 'assistant', content: 'Two' },
          { role: 'user', content: 'Three' },
        ],
      },
    });
    expect(trailingUser.state.status).toBe(400);
    expect(consumeRpc).not.toHaveBeenCalled();
  });

  it('accepts empty history and a single complete pair', async () => {
    const empty = await invoke({ body: { question: 'Hi', viewingSeason: 2026, history: [] } });
    expect(empty.state.status).toBe(200);

    const pair = await invoke({
      body: {
        question: 'And soybeans?',
        viewingSeason: 2026,
        history: [
          { role: 'user', content: 'How many acres of corn?' },
          { role: 'assistant', content: '120 acres of corn.' },
        ],
      },
    });
    expect(pair.state.status).toBe(200);
    expect(consumeRpc).toHaveBeenCalled();
  });

  it('returns 400 when no farm is selected without consuming quota', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: { farm_id: null, active_season: 2026 }, error: null });
    const { state } = await invoke();
    expect(state.status).toBe(400);
    expect(state.body).toEqual({ error: 'No farm selected.' });
    expect(consumeRpc).not.toHaveBeenCalled();
  });

  it('returns 429 when the daily quota is exhausted', async () => {
    consumeRpc.mockResolvedValue({ data: { allowed: false }, error: null });
    const { state } = await invoke();
    expect(state.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the quota RPC errors', async () => {
    consumeRpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } });
    const { state } = await invoke();
    expect(state.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 500 when OPENROUTER_API_KEY is missing after body validation and before quota', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { state } = await invoke();
    expect(state.status).toBe(500);
    expect(consumeRpc).not.toHaveBeenCalled();
  });

  it('creates the user-scoped client with the anon key and bearer token, never a service role', async () => {
    await invoke();
    expect(createClientMock).toHaveBeenCalled();
    const [, key, options] = createClientMock.mock.calls[0] as [string, string, { global?: { headers?: Record<string, string> } }];
    expect(key).toBe('anon-key');
    expect(JSON.stringify(createClientMock.mock.calls[0])).not.toMatch(/service_role/i);
    expect(options.global?.headers?.Authorization).toBe('Bearer valid-token');
  });

  it('returns 502 when OpenRouter returns non-JSON', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>nope</html>',
    } as unknown as Response);
    const { state } = await invoke();
    expect(state.status).toBe(502);
  });

  it('returns 504 when the upstream request times out', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));

    const pending = invoke();
    await vi.advanceTimersByTimeAsync(45_000);
    const { state } = await pending;
    expect(state.status).toBe(504);
  });

  it('runs both parallel function calls before the next OpenRouter fetch', async () => {
    executeNamedTool.mockResolvedValue({ lookup: 'Looked up records', rows: [] });
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls([
        { id: 'c1', name: 'bin_inventory' },
        { id: 'c2', name: 'seed_library' },
      ]))
      .mockResolvedValueOnce(openRouterMessage('North bin has 500 bushels.'));

    const { state } = await invoke();
    expect(state.status).toBe(200);
    expect(executeNamedTool).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    expect(executeNamedTool.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[1]);
    expect(executeNamedTool.mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[1]);
  });

  it('caps tool executions at 8 and sends budget errors through one final answer-only round', async () => {
    executeNamedTool.mockResolvedValue({ lookup: 'Looked up records', rows: [] });
    const calls = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: 'seed_library' }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls(calls))
      .mockResolvedValueOnce(openRouterMessage('I found the available seed records.'));

    const { state } = await invoke();
    expect(state.status).toBe(200);
    expect(executeNamedTool).toHaveBeenCalledTimes(8);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const secondBody = fetchBodies()[1];
    expect(secondBody.tools).toBeUndefined();
    const toolMessages = (secondBody.messages as Array<Record<string, unknown>>)
      .filter(message => message.role === 'tool');
    expect(toolMessages).toHaveLength(9);
    expect(JSON.parse(String(toolMessages[8].content))).toEqual({ error: 'tool budget exceeded' });
    expect((state.body as { answer: string }).answer).toBe('I found the available seed records.');
  });

  it('sends a lookup-failed tool output and continues the loop when a tool throws', async () => {
    executeNamedTool.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ lookup: 'Looked up records', rows: [] });
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'c1', name: 'bin_inventory' }]))
      .mockResolvedValueOnce(openRouterMessage('Bins are empty this season.'));

    const { state } = await invoke();
    expect(state.status).toBe(200);
    const secondBody = fetchBodies()[1];
    const messages = secondBody.messages as Array<Record<string, unknown>>;
    const toolOutput = messages.find(message => message.role === 'tool');
    expect(JSON.parse(String(toolOutput?.content))).toEqual({ error: 'lookup failed' });
  });

  it('returns invalid arguments as tool output without querying', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls([
        { id: 'c1', name: 'earliest_planting', arguments: '{"crop":""}' },
      ]))
      .mockResolvedValueOnce(openRouterMessage('I cannot delete or change records.'));

    const { state } = await invoke();
    expect(state.status).toBe(200);
    expect(fromTables).not.toContain('plant_records');
    const secondBody = fetchBodies()[1];
    const messages = secondBody.messages as Array<Record<string, unknown>>;
    const toolOutput = messages.find(message => message.role === 'tool');
    expect(JSON.parse(String(toolOutput?.content))).toEqual({ error: 'invalid arguments' });
  });

  it('falls back without another round when OpenRouter finishes for length', async () => {
    vi.mocked(fetch).mockResolvedValue(openRouterMessage('', 'length'));
    const { state } = await invoke();
    expect(state.status).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect((state.body as { answer: string }).answer).toMatch(/couldn't look that up/i);
  });

  it('forces an answer-only request after four function-call rounds', async () => {
    executeNamedTool.mockResolvedValue({ lookup: 'Looked up records', rows: [] });
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'c1', name: 'seed_library' }]))
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'c2', name: 'seed_library' }]))
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'c3', name: 'seed_library' }]))
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'c4', name: 'seed_library' }]))
      .mockResolvedValueOnce(openRouterMessage('Seeds listed.'));
    const { state } = await invoke();
    expect(state.status).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);
    expect(fetchBodies()[4].tools).toBeUndefined();
    expect((state.body as { answer: string }).answer).toBe('Seeds listed.');
  });

  it('sends the OpenRouter model, privacy controls, and nested tool definitions', async () => {
    executeNamedTool.mockResolvedValue({ lookup: 'Looked up records', rows: [] });
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'c1', name: 'seed_library' }]))
      .mockResolvedValueOnce(openRouterMessage('Your seed library has Pioneer corn.'));

    await invoke();
    const bodies = fetchBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].model).toBe('openrouter/free');
    expect(bodies[0].max_tokens).toBe(2048);
    expect(bodies[0].provider).toEqual({ data_collection: 'deny', require_parameters: true });
    expect(bodies[0].tool_choice).toBe('auto');
    expect(bodies[0].tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'seed_library' }),
      }),
    ]));
    expect(bodies[0].input).toBeUndefined();
    expect(bodies[0].include).toBeUndefined();
    expect(bodies[1].tools).toBeDefined();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer openrouter-key');
  });

  it('replays reasoning details and assistant tool calls unchanged before tool results', async () => {
    executeNamedTool.mockResolvedValue({ lookup: 'Looked up records', rows: [] });
    const reasoning = [{ type: 'reasoning.encrypted', id: 'rs_1', data: 'blob-abc' }];
    vi.mocked(fetch)
      .mockResolvedValueOnce(openRouterToolCalls([{ id: 'call_1', name: 'seed_library' }], reasoning))
      .mockResolvedValueOnce(openRouterMessage('Seeds listed.'));

    await invoke();
    const secondMessages = fetchBodies()[1].messages as Array<Record<string, unknown>>;
    const assistantIndex = secondMessages.findIndex(message => message.role === 'assistant');
    const toolIndex = secondMessages.findIndex(message => message.role === 'tool');
    expect(secondMessages[assistantIndex].reasoning_details).toEqual(reasoning);
    expect(secondMessages[assistantIndex].tool_calls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'seed_library', arguments: '{}' },
      },
    ]);
    expect(toolIndex).toBeGreaterThan(assistantIndex);
  });
});
