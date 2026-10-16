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
  const request = new Request(url);
  return new Proxy(request, {
    get(target, prop, receiver) {
      if (prop === 'mode') return 'navigate';
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Request;
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

  it('falls back to the precached shell when the network hangs and that URL is not cached', async () => {
    expect(NAVIGATION_TIMEOUT_MS).toBe(3_000);
    vi.useFakeTimers();
    let aborted = false;
    const fetchImpl = vi.fn((input: Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      expect(input.url).toContain('/settings');
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      });
      void resolve;
    }));
    const matchPrecache = vi.fn(async (url: string) => {
      return url === '/index.html' ? new Response(BUILD_B) : undefined;
    });

    const pending = handleNavigation(
      navigateRequest(`${location.origin}/settings`),
      { fetchImpl, matchPrecache, timeoutMs: NAVIGATION_TIMEOUT_MS },
    );
    const result = pending.then(async (response) => {
      return { html: await response.text(), aborted };
    });
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(matchPrecache).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    const { html, aborted: didAbort } = await result;
    expect(didAbort).toBe(true);
    expect(html).toBe(BUILD_B);
    expect(matchPrecache).toHaveBeenCalledTimes(1);
    expect(matchPrecache).toHaveBeenCalledWith('/index.html');
  });
});
