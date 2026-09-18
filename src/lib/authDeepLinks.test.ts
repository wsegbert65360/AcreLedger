/**
 * @vitest-environment jsdom
 *
 * Native password-recovery links must stay locked to
 * com.wsegbert.acreledger://auth/recovery. These tests cover host/path
 * rejection, PKCE-code vs token-fragment precedence, duplicate-event
 * suppression, and error re-entry after a failed exchange.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreState = vi.hoisted(() => ({ isNative: false }));

const capApp = vi.hoisted(() => {
  let urlOpenHandler: ((event: { url: string }) => void) | null = null;
  const remove = vi.fn();
  return {
    remove,
    getLaunchUrl: vi.fn(async (): Promise<{ url?: string } | undefined> => undefined),
    addListener: vi.fn(async (_event: string, handler: (event: { url: string }) => void) => {
      urlOpenHandler = handler;
      return { remove };
    }),
    emitUrlOpen(url: string) {
      urlOpenHandler?.({ url });
    },
    resetHandler() {
      urlOpenHandler = null;
    },
  };
});

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => coreState.isNative,
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: capApp.getLaunchUrl,
    addListener: capApp.addListener,
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: auth.exchangeCodeForSession,
      setSession: auth.setSession,
    },
  },
}));

import {
  getPasswordRecoveryRedirectUrl,
  listenForNativePasswordRecovery,
  NATIVE_AUTH_SCHEME,
} from './authDeepLinks';

const RECOVERY = `${NATIVE_AUTH_SCHEME}://auth/recovery`;

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('getPasswordRecoveryRedirectUrl', () => {
  afterEach(() => {
    coreState.isNative = false;
  });

  it('returns the web recovery path off native', () => {
    coreState.isNative = false;
    expect(getPasswordRecoveryRedirectUrl()).toBe(`${window.location.origin}/auth?mode=recovery`);
  });

  it('returns the native recovery scheme on device', () => {
    coreState.isNative = true;
    expect(getPasswordRecoveryRedirectUrl()).toBe(RECOVERY);
  });
});

describe('listenForNativePasswordRecovery', () => {
  beforeEach(() => {
    coreState.isNative = true;
    capApp.resetHandler();
    capApp.remove.mockReset();
    capApp.getLaunchUrl.mockReset();
    capApp.getLaunchUrl.mockResolvedValue(undefined);
    capApp.addListener.mockClear();
    auth.exchangeCodeForSession.mockReset();
    auth.setSession.mockReset();
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    auth.setSession.mockResolvedValue({ error: null });
  });

  it('is a no-op on web', () => {
    coreState.isNative = false;
    const stop = listenForNativePasswordRecovery(vi.fn(), vi.fn());
    stop();
    expect(capApp.addListener).not.toHaveBeenCalled();
    expect(capApp.getLaunchUrl).not.toHaveBeenCalled();
  });

  it('rejects a recovery URL with the wrong host', async () => {
    const onRecovery = vi.fn();
    const onError = vi.fn();
    const stop = listenForNativePasswordRecovery(onRecovery, onError);
    await flush();

    capApp.emitUrlOpen(`${NATIVE_AUTH_SCHEME}://other/recovery?code=abc`);
    await flush();

    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(onRecovery).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('rejects a recovery URL with the wrong path', async () => {
    const onRecovery = vi.fn();
    const onError = vi.fn();
    const stop = listenForNativePasswordRecovery(onRecovery, onError);
    await flush();

    capApp.emitUrlOpen(`${NATIVE_AUTH_SCHEME}://auth/reset?code=abc`);
    await flush();

    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(onRecovery).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('exchanges a PKCE code and ignores a token fragment on the same URL', async () => {
    const onRecovery = vi.fn();
    const onError = vi.fn();
    const stop = listenForNativePasswordRecovery(onRecovery, onError);
    await flush();

    capApp.emitUrlOpen(
      `${RECOVERY}?code=pkce-code#access_token=legacy&refresh_token=legacy-refresh`,
    );
    await flush();

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(onRecovery).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('establishes a session from a legacy token fragment', async () => {
    const onRecovery = vi.fn();
    const stop = listenForNativePasswordRecovery(onRecovery, vi.fn());
    await flush();

    capApp.emitUrlOpen(`${RECOVERY}#access_token=access&refresh_token=refresh`);
    await flush();

    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(onRecovery).toHaveBeenCalledTimes(1);
    stop();
  });

  it('deduplicates the same recovery URL', async () => {
    const onRecovery = vi.fn();
    const stop = listenForNativePasswordRecovery(onRecovery, vi.fn());
    await flush();

    const url = `${RECOVERY}?code=once`;
    capApp.emitUrlOpen(url);
    await flush();
    capApp.emitUrlOpen(url);
    await flush();

    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(onRecovery).toHaveBeenCalledTimes(1);
    stop();
  });

  it('allows the same URL to re-enter after an exchange error', async () => {
    const onRecovery = vi.fn();
    const onError = vi.fn();
    auth.exchangeCodeForSession
      .mockResolvedValueOnce({ error: new Error('expired') })
      .mockResolvedValueOnce({ error: null });

    const stop = listenForNativePasswordRecovery(onRecovery, onError);
    await flush();

    const url = `${RECOVERY}?code=retry`;
    capApp.emitUrlOpen(url);
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onRecovery).not.toHaveBeenCalled();

    capApp.emitUrlOpen(url);
    await flush();

    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(2);
    expect(onRecovery).toHaveBeenCalledTimes(1);
    stop();
  });

  it('handles a launch URL and ignores events after cleanup', async () => {
    const onRecovery = vi.fn();
    capApp.getLaunchUrl.mockResolvedValueOnce({ url: `${RECOVERY}?code=launch` });

    const stop = listenForNativePasswordRecovery(onRecovery, vi.fn());
    await flush();

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('launch');
    expect(onRecovery).toHaveBeenCalledTimes(1);

    stop();
    capApp.emitUrlOpen(`${RECOVERY}?code=later`);
    await flush();

    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
});
