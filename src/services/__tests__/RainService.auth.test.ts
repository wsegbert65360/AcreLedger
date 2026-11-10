import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: getSessionMock } } }));

import { RainService } from '../RainService';

const FIELD = '11111111-1111-4111-8111-111111111111';
const okBody = { periodEndUtc: '2026-03-17T14:00:00Z', rain: { '12h': 0, '24h': 0, '72h': 0, '168h': 0 } };

describe('RainService sends the Supabase login to the Rain API', () => {
  beforeEach(() => {
    RainService.__test_clearCache();
    vi.stubEnv('VITE_RAIN_API_URL', 'https://rain.example.com');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => okBody })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    getSessionMock.mockReset();
  });

  it('adds a bearer token when signed in', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    await RainService.fetchComprehensiveRainfall({ fieldId: FIELD, lat: 38.46, lng: -93.53 });
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('sends no Authorization header without a session or when the lookup throws', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await RainService.fetchComprehensiveRainfall({ fieldId: FIELD, lat: 38.46, lng: -93.53 });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].headers).toEqual({});

    RainService.__test_clearCache();
    getSessionMock.mockRejectedValue(new Error('storage unavailable'));
    await RainService.fetchComprehensiveRainfall({ fieldId: FIELD, lat: 38.47, lng: -93.54 });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].headers).toEqual({});
  });
});
