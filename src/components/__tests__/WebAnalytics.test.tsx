import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WebAnalytics, { beforeSend, shouldEnableWebAnalytics } from '../WebAnalytics';

const mocks = vi.hoisted(() => ({ isNative: vi.fn(), analytics: vi.fn((_props: Record<string, unknown>) => null) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNative } }));
vi.mock('@vercel/analytics/react', () => ({ Analytics: mocks.analytics }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('WebAnalytics', () => {
  it.each([
    { isNative: true, isProd: true, enabled: false },
    { isNative: true, isProd: false, enabled: false },
    { isNative: false, isProd: false, enabled: false },
    { isNative: false, isProd: true, enabled: true },
  ])('gates analytics for $isNative native / $isProd production', ({ isNative, isProd, enabled }) => {
    expect(shouldEnableWebAnalytics({ isNative, isProd })).toBe(enabled);
    mocks.isNative.mockReturnValue(isNative);
    vi.stubEnv('PROD', isProd);
    render(<WebAnalytics />);
    expect(mocks.analytics).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (enabled) {
      expect(mocks.analytics.mock.calls[0][0]).toMatchObject({ mode: 'production', beforeSend });
    }
  });

  it.each(['pageview', 'event'] as const)('strips query and fragment from %s URLs without mutating input', (type) => {
    const event = { type, url: 'https://acreledger.com/reports?email=private&farm_id=secret#user-id' };
    expect(beforeSend(event)).toEqual({ type, url: 'https://acreledger.com/reports' });
    expect(event.url).toContain('?email=');
  });

  it('redacts field IDs', () => {
    expect(beforeSend({ type: 'pageview', url: 'https://acreledger.com/field/private-id?farm=secret#token' }))
      .toEqual({ type: 'pageview', url: 'https://acreledger.com/field/[id]' });
  });

  it.each(['https://acreledger.com/private-email', 'invalid'])('drops unrecognized or invalid URLs: %s', (url) => {
    expect(beforeSend({ type: 'pageview', url })).toBeNull();
  });
});
