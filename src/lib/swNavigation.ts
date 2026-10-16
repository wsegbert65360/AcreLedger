import {
  matchPrecache as workboxMatchPrecache,
  precacheAndRoute as workboxPrecacheAndRoute,
} from 'workbox-precaching';
import {
  NavigationRoute,
  registerRoute as workboxRegisterRoute,
  type Route,
} from 'workbox-routing';

/** Bound on a navigation fetch before the current precached shell is used. */
export const NAVIGATION_TIMEOUT_MS = 3_000;

type MatchPrecache = (url: string) => Promise<Response | undefined>;

export type NavigationDeps = {
  fetchImpl?: (input: Request, init?: RequestInit) => Promise<Response>;
  matchPrecache?: MatchPrecache;
  timeoutMs?: number;
};

/**
 * Network-first navigation with no runtime HTML cache.
 * A hang, a failure, or a non-OK response falls back to the current
 * precached `/index.html`, whose hashed assets still exist in that precache.
 */
export async function handleNavigation(
  request: Request,
  deps: NavigationDeps = {},
): Promise<Response> {
  const doFetch = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const matchShell = deps.matchPrecache ?? workboxMatchPrecache;
  const timeoutMs = deps.timeoutMs ?? NAVIGATION_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      doFetch(request, { signal: controller.signal }),
      new Promise<Response>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DOMException('Navigation timed out', 'AbortError'));
        }, timeoutMs);
      }),
    ]);
    if (response?.ok) return response;
  } catch {
    // Offline, aborted, or still hanging past the deadline.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  const shell = await matchShell('/index.html');
  return shell ?? Response.error();
}

type PrecacheEntries = Parameters<typeof workboxPrecacheAndRoute>[0];

/**
 * Register the navigation handler before precaching. `precacheAndRoute`
 * treats `/` as `/index.html` (directory index), so a later navigation
 * route would never see a dashboard reload.
 */
export function installRoutes(
  manifest: PrecacheEntries,
  hooks: {
    registerRoute?: (route: Route) => void;
    precacheAndRoute?: (entries: PrecacheEntries) => void;
    navigation?: NavigationDeps;
  } = {},
): void {
  const register = hooks.registerRoute ?? workboxRegisterRoute;
  const precache = hooks.precacheAndRoute ?? workboxPrecacheAndRoute;
  register(new NavigationRoute(
    ({ request }) => handleNavigation(request, hooks.navigation),
    { denylist: [/^\/api\//] },
  ));
  precache(manifest);
}
