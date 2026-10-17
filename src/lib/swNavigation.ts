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
  const doFetch = deps.fetchImpl ?? ((input: Request) => fetch(input));
  const matchShell = deps.matchPrecache ?? workboxMatchPrecache;
  const timeoutMs = deps.timeoutMs ?? NAVIGATION_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // fetch(navigateRequest, init) throws TypeError on older Chrome because
    // the implementation rebuilds the request. Workbox races a timer instead
    // of passing AbortSignal (workbox #1796). Call fetch with no init.
    const response = await Promise.race([
      doFetch(request),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
    if (response?.ok) return response;
  } catch {
    // Offline, or the network fetch failed. A timeout settles the race
    // and falls through to the precached shell.
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
