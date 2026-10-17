/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Route, Router } from 'workbox-routing';

import {
  handleNavigation,
  installRoutes,
  NAVIGATION_TIMEOUT_MS,
} from './swNavigation';

const BUILD_A = '<!doctype html><script src="/assets/index-OLD.js"></script>';
const BUILD_B = '<!doctype html><script src="/assets/index-NEW.js"></script>';

function navigateRequest(url: string): Request {
  // A Proxy that forwards getters with the proxy as receiver throws
  // "Cannot read private member #state" on Node 20. Override mode in place.
  const request = new Request(url);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

function strictNavigateFetch(body: string | null): (
  input: Request,
  ...rest: unknown[]
) => Promise<Response> {
  return (input, ...rest) => {
    if (input.mode === 'navigate' && rest.length > 0) {
      throw new TypeError('RequestInit is not allowed for a navigate request');
    }
    if (body === null) return new Promise<Response>(() => {});
    return Promise.resolve(new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
  };
}

/** Precache directory-index behavior: `/` and `/index.html` both hit the shell. */
function precacheDirectoryIndexRoute(shell: string): Route {
  return new Route(({ url }) => {
    return url.pathname === '/index.html' || url.pathname.endsWith('/');
  }, async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } }));
}

describe('navigation fallback', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches fresh HTML for / and /index.html ahead of the precache directory index', async () => {
    const router = new Router();
    const fresh = '<!doctype html><script src="/assets/index-FRESH.js"></script>';
    const fetchImpl = vi.fn(async () => new Response(fresh, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    const matchPrecache = vi.fn(async () => new Response(BUILD_B));
    installRoutes([{ url: '/index.html', revision: 'build-b' }], {
      registerRoute: (route) => router.registerRoute(route),
      precacheAndRoute: () => {
        router.registerRoute(precacheDirectoryIndexRoute(BUILD_A));
      },
      navigation: { fetchImpl, matchPrecache },
    });

    for (const path of ['/', '/index.html']) {
      const response = await router.handleRequest({
        request: navigateRequest(`${location.origin}${path}`),
        event: {} as never,
      });
      expect(response).toBeDefined();
      expect(await response!.text()).toBe(fresh);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(matchPrecache).not.toHaveBeenCalled();

    const apiResponse = await router.handleRequest({
      request: navigateRequest(`${location.origin}/api/weather`),
      event: {} as never,
    });
    expect(apiResponse).toBeUndefined();
  });

  it('uses the current precached shell offline instead of an older runtime HTML entry', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const matchPrecache = vi.fn(async (url: string) => {
      return url === '/index.html' ? new Response(BUILD_B) : undefined;
    });
    vi.stubGlobal('caches', {
      match: vi.fn(async () => new Response(BUILD_A)),
      open: vi.fn(async () => {
        throw new Error('navigations must not write a runtime HTML cache');
      }),
    });

    const response = await handleNavigation(
      navigateRequest(`${location.origin}/settings`),
      { fetchImpl, matchPrecache },
    );
    const html = await response.text();
    expect(html).toContain('/assets/index-NEW.js');
    expect(html).not.toContain('/assets/index-OLD.js');
    expect(matchPrecache).toHaveBeenCalledWith('/index.html');
    expect(vi.mocked(caches.match)).not.toHaveBeenCalled();
  });

  it('returns network HTML when fetch throws TypeError if given RequestInit for a navigate request', async () => {
    const fresh = '<!doctype html><script src="/assets/index-FRESH.js"></script>';
    const fetchImpl = vi.fn(strictNavigateFetch(fresh));
    const sample = navigateRequest(`${location.origin}/settings`);
    expect(() => fetchImpl(sample, {})).toThrow(TypeError);
    fetchImpl.mockClear();

    const matchPrecache = vi.fn(async () => new Response(BUILD_A));
    const response = await handleNavigation(sample, { fetchImpl, matchPrecache });
    expect(await response.text()).toBe(fresh);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]).toHaveLength(1);
    expect(matchPrecache).not.toHaveBeenCalled();
  });

  it('falls back to the precached shell when the network hangs and that URL is not cached', async () => {
    expect(NAVIGATION_TIMEOUT_MS).toBe(3_000);
    vi.useFakeTimers();
    const fetchImpl = vi.fn(strictNavigateFetch(null));
    const matchPrecache = vi.fn(async (url: string) => {
      return url === '/index.html' ? new Response(BUILD_B) : undefined;
    });

    const pending = handleNavigation(
      navigateRequest(`${location.origin}/settings`),
      { fetchImpl, matchPrecache, timeoutMs: NAVIGATION_TIMEOUT_MS },
    );
    const result = pending.then(async (response) => response.text());
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(matchPrecache).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const html = await result;
    expect(html).toBe(BUILD_B);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]).toHaveLength(1);
    const fetched = fetchImpl.mock.calls[0]?.[0] as Request;
    expect(fetched.mode).toBe('navigate');
    expect(fetched.url).toContain('/settings');
    expect(matchPrecache).toHaveBeenCalledTimes(1);
    expect(matchPrecache).toHaveBeenCalledWith('/index.html');
  });
});
