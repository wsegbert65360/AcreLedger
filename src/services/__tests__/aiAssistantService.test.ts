import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('askAcreLedger', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_AI_ASSISTANT_URL', '');
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts the question, viewing season, history, and bearer token', async () => {
    vi.resetModules();
    const { askAcreLedger } = await import('../aiAssistantService');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'April 12, Pioneer.', lookups: ['Earliest corn'] }),
    } as Response);

    const result = await askAcreLedger(
      'When was corn planted?',
      'access-token',
      2026,
      [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }],
    );

    expect(fetch).toHaveBeenCalledWith('/api/ai-assistant', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      }),
    }));
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body).toEqual({
      question: 'When was corn planted?',
      viewingSeason: 2026,
      history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }],
    });
    expect(result).toEqual({ answer: 'April 12, Pioneer.', lookups: ['Earliest corn'] });
  });

  it('forwards an abort signal to fetch', async () => {
    vi.resetModules();
    const { askAcreLedger } = await import('../aiAssistantService');
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'April 12, Pioneer.', lookups: [] }),
    } as Response);

    await askAcreLedger('When was corn planted?', 'access-token', 2026, [], controller.signal);

    expect(fetch).toHaveBeenCalledWith('/api/ai-assistant', expect.objectContaining({
      signal: controller.signal,
    }));
  });

  it('throws the server error message on 429', async () => {
    vi.resetModules();
    const { askAcreLedger } = await import('../aiAssistantService');
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Daily question limit reached.' }),
    } as Response);

    await expect(askAcreLedger('Hi', 'token', 2026)).rejects.toThrow('Daily question limit reached.');
  });

  it('throws a generic message when the error body is malformed', async () => {
    vi.resetModules();
    const { askAcreLedger } = await import('../aiAssistantService');
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);

    await expect(askAcreLedger('Hi', 'token', 2026)).rejects.toThrow('The assistant is unavailable right now.');
  });

  it('throws when a successful response is not JSON with an answer', async () => {
    vi.resetModules();
    const { askAcreLedger } = await import('../aiAssistantService');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ nope: true }),
    } as Response);

    await expect(askAcreLedger('Hi', 'token', 2026)).rejects.toThrow('The assistant is unavailable right now.');
  });
});
