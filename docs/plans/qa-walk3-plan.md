# Plan: QA3 fixes: sign-in→onboarding bounce, stale PWA bundle, /setup 404

## Context
Prod QA found three bugs: (a) an already-onboarded user who signs back in (Setup → Sign Out → /auth?mode=signin) gets bounced to /onboarding and stays there; (b) returning PWA users keep running an old bundle (`index-8lG_PmGd.js`) after a deploy until they clear site data; (c) `/setup` shows the in-app "Page not found" screen. Changes stay minimal; each one gets a unit test.

---

## (a) Onboarding bounce after sign-in

### Root cause
`onboardingComplete === false` can mean "not onboarded" or "the profile hasn't loaded yet", and the guard treats both the same way.

1. **Sign-out deletes the cached flag.** `signOut` (`src/store/farmStore.tsx:861`) calls `clearLocalCache`. That uses `selectCacheKeysToRemove` (`src/store/useSeasonManagement.ts:59-69`), which removes every `${userId}_al_*` key, including `${userId}_al_onboarding_complete`.
2. **SIGNED_IN never seeds the flag.** Only the cold-load path (`initSession`, `src/store/useAuth.ts:108-114`) reads the cached `'1'`. The `onAuthStateChange` → `acceptSession` path (`useAuth.ts:28-45, 147-150`) resets `onboardingComplete` to `false` on identity change and leaves it there until `syncAuth` finishes. `syncAuth` makes two sequential round-trips: the deletion check, then the `profiles` select (`useAuth.ts:168-204`).
3. **The data fetch can finish first.** `farm_id` is available right away from the JWT (`useAuth.ts:43-44`). That means `identityKey` is set, cache hydration runs on a cache emptied at sign-out, and `fetchData` (`farmStore.tsx:487-702`) can reach `setInitialFetchComplete(true)` before the profile request returns.
4. **The guard fires on the gap.** `src/App.tsx:336-343`: `initialFetchComplete && !fetchError && !onboardingComplete && !localStorage.getItem(onboardingKey) && fields.length === 0` evaluates true, which renders `<Navigate to="/onboarding">`. This is the "~300 ms later" redirect.
5. **It never recovers.** The guard only redirects *to* `/onboarding`. `src/pages/Onboarding.tsx` only leaves through `completeOnboarding()`, so the user stays there after the profile loads.

A cold load of `/` works because `initSession` reads the cached `'1'` before anything renders.

Caveat: step 4 needs the account to have no visible fields when `fetchData` settles. That fits an onboarded QA account with no fields, but I haven't checked the account's data. The fix below closes the race either way.

### Fix: track whether onboarding status is actually known
- **`src/store/useAuth.ts`**
  - Add `const [onboardingStatusKnown, setOnboardingStatusKnown] = useState(false)`.
  - In the `acceptSession` identity-change branch (next to `setOnboardingComplete(false)`, line 37), call `setOnboardingStatusKnown(false)`.
  - In `initSession`, set it to `true` where `storedOnboarding === '1'` (line 114). A cached positive stays trusted for cold and offline loads, so current behaviour is unchanged.
  - In `syncAuth`, set it to `true` right after `setOnboardingComplete(Boolean(profileData.onboarding_complete))` (line 204).
  - Return `onboardingStatusKnown` from the hook.
- **`src/store/farmStore.tsx`**: add `onboardingStatusKnown: boolean` to the context type (near line 196) and pass it through in the provider value (near line 1026).
- **`src/App.tsx:154, 336-341`**: destructure `onboardingStatusKnown` and add `onboardingStatusKnown &&` to the start of `needsOnboarding`. Update the comment to say the guard waits for both the data load and the profile.

Tradeoff: if a brand-new user's profile request fails, they see an empty dashboard instead of onboarding until a later `syncAuth` retry (on focus, visibility change or coming back online) succeeds. That's acceptable, because sign-in already requires a network connection.

### Tests
- `src/App.test.tsx`, in "signed-in routing":
  - With `fields: []`, `onboardingComplete: false`, `initialFetchComplete: true` and `onboardingStatusKnown: false`, `/` renders `app-dashboard` and the path stays `/` (regression for the bug).
  - The same state with `onboardingStatusKnown: true` redirects to `/onboarding`, so the new-user path still works.
  - Add `onboardingStatusKnown: true` to `signedInState`.
- `src/store/__tests__/useAuth.test.tsx` (follow the existing harness):
  - A `SIGNED_IN` event gives `onboardingStatusKnown === false` until the profile resolves. After it resolves, `onboardingStatusKnown === true` and `onboardingComplete === true`.
  - `SIGNED_OUT` resets it to `false`.
  - A cold load with `${uid}_al_onboarding_complete = '1'` is known and `true` before the profile resolves.
  - The existing test "reconciles profile onboarding false over a cached true value" should still pass.

---

## (b) Stale PWA bundle for returning users

### What I found (code plus `curl` against https://acreledger.vercel.app)
- **Navigations are cache-first.** `src/sw.js:22-25` serves every navigation from the precached `/index.html` through `createHandlerBoundToURL`. A returning user always boots the *old* index.html and old bundle. They only get new code if the whole chain completes: the browser finds the new `sw.js`, the new worker precaches all 113 files (several MB), runs `skipWaiting`/`claim`, and the page reloads. If any step stalls (for example a precache fetch fails during install, or the user is on a slow link), the user stays on old code indefinitely. Clearing site data removes the worker, which matches the symptom.
- **The reload is deferred on the Setup page.** `src/main.tsx:61` defers the reload while `[data-state="open"]` exists. `src/pages/Settings.tsx:72` (the Setup page, where QA was) renders a Radix `Accordion` with sections open by default, so the selector always matches there. The reload waits 10 × 30 s.
- **There are two uncoordinated reload paths, and one callback is dead.** With `registerType: 'autoUpdate'`, vite-plugin-pwa 1.3.0 (`node_modules/vite-plugin-pwa/dist/client/build/register.js`) calls `window.location.reload()` directly on `activated` with `isUpdate`/`isExternal`. That bypasses `reloadOnce` and the overlay guard and races with the `controllerchange` handler. `onNeedRefresh` is never called in autoUpdate mode.
- **Missing assets return HTML with a 200.** The rewrite `/((?!api/).*)` → `/index.html` in `vercel.json` catches assets that don't exist: `GET /assets/index-8lG_PmGd.js` returns `200 text/html`. When an old tab lazy-loads a chunk from a previous deploy, it gets HTML back instead of a clean 404.
- **Not the cause:**
  - `hadControllerAtLoad` is correct. It only skips the reload on a first-ever visit, which already loaded from the network.
  - Headers on `/`, `/index.html` and `/sw.js` are already `no-store` on prod.
  - `vite.config.ts` uses `filename: 'sw.js'`, which matches `src/sw.js`. The `src/sw.ts` in the coverage exclude list is a harmless leftover.
  - All 113 precache URLs in the live `sw.js` return 200.

### Fix
1. **`src/sw.js`: serve navigations network-first, with no runtime HTML cache, falling back to the precached index.html.** This is the main fix. Online users always get the current `index.html` (`no-store`), which points at hashed assets; any asset not in the old precache falls through to the network. Fresh code then no longer depends on the service-worker update lifecycle, and offline still works. There is no `NetworkFirst` strategy and no `al-navigations` runtime cache. `installRoutes` (`src/lib/swNavigation.ts`) registers the navigation route before precaching. The handler calls `fetch(request)` with no `RequestInit` — a navigate-mode request plus init throws `TypeError` on older Chrome — and races that fetch against a 3s timer. A hang, a failure, or a non-OK response uses the current precached `/index.html` only.
   ```js
   import { cleanupOutdatedCaches } from 'workbox-precaching';
   import { installRoutes } from './lib/swNavigation';
   installRoutes(self.__WB_MANIFEST);
   cleanupOutdatedCaches();
   ```
   A reload skipped because one already ran inside the 10s guard is retried once when that window ends.
2. **`src/main.tsx`: one reload path, guarded against loops.**
   - Pass `onNeedReload: reloadOnce` to `registerSW` so the plugin's `activated` reload goes through the guard. Delete the dead `onNeedRefresh`.
   - Narrow the overlay selector to real modals: `[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]`. This drops the bare `[data-state="open"]` that matches Accordions.
   - Loop guard: before `window.location.reload()`, set `sessionStorage['al_sw_reloaded_at'] = Date.now()`. If it was set less than 10 s ago, do not reload immediately. Schedule exactly one retry for the remaining time (`setTimeout`); repeated calls in that window must not stack another timer. When the window ends, reload once. Together with the existing `reloading` flag, this caps it at one reload per update, even if `controllerchange` and `activated` both fire or the new page is briefly served stale.
   - Extract `reloadOnce`/`shouldDeferReload` into a small testable module, `src/lib/swReload.ts`. `main.tsx` is excluded from coverage and hard to unit-test.
3. **`vercel.json`**
   - Change the rewrite source to `/((?!api/|assets/).*)` so missing hashed chunks return a real 404. `vite:preloadError` then triggers `reloadOnce`, which now loads fresh HTML through network-first.
   - Add a `/assets/(.*)` header: `Cache-Control: public, max-age=31536000, immutable`.

### Tests
- New `src/lib/swReload.test.ts`:
  - It defers while a `role="dialog"` with `data-state="open"` is mounted.
  - It does *not* defer for an open Accordion (`data-state="open"` with no dialog role).
  - It force-reloads after `MAX_DEFERS`.
  - Two triggers in a row (`controllerchange` + `activated`) produce exactly one `location.reload`.
  - A recent `al_sw_reloaded_at` in sessionStorage suppresses an immediate reload, then reloads once when the 10 s window ends. Repeated calls schedule only one retry.
- `src/test/securityHeaders.test.ts`, extended or as a sibling test:
  - The rewrite excludes `assets/`.
  - `/assets/(.*)` is `immutable`.
  - `sw.js`, `/` and `/index.html` stay `no-store`.
- New `src/test/swSource.test.ts` (static source check, the same style as the existing config tests):
  - `src/sw.js` serves navigations network-first with no runtime HTML cache (no `NetworkFirst`, no `al-navigations`) and falls back to the precached shell.
  - It no longer uses `createHandlerBoundToURL`.
  - It still calls `skipWaiting`/`clients.claim`.

---

## (c) `/setup` shows "Page not found"
Setup is the `/settings` route: `src/components/navConfig.ts:8` (`label: 'Setup'`), `src/pages/Settings.tsx:57`, and the route at `src/App.tsx:128`. The server returns 200 for `/setup` (SPA rewrite). The "404" is the client catch-all `NotFound` (`App.tsx:136`).

### Fix
In `src/App.tsx`, add a redirect that keeps the query string (for `?section=`), modelled on `BillingSettingsRedirect` (`App.tsx:104`):
```tsx
function SetupRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/settings${search}`} replace />;
}
// next to line 128:
<Route path="/setup" element={<SetupRedirect />} />
```
Signed-out users hitting `/setup` already fall into `*` → `/` (the landing page), which is fine.

### Tests
In `src/App.test.tsx` → "signed-in routing":
- `/setup` renders `settings-page`, with `pathname === '/settings'`.
- `/setup?section=billing` keeps `?section=billing`.

---

## Verification
- `npx vitest run src/App.test.tsx src/store/__tests__/useAuth.test.tsx src/lib/swReload.test.ts src/test/securityHeaders.test.ts src/test/swSource.test.ts`, then the full `npm test`, `npm run lint` and `npx tsc --noEmit`.
- `npm run build`, then check that `dist/sw.js` has no `NetworkFirst` and no `al-navigations` runtime cache, and that the precache manifest still lists `index.html`. Navigations are network-first and fall back to that precached shell. A reload skipped inside the 10 s guard retries once when the window ends.
- `npm run preview` with Playwright:
  1. Sign in, then Setup → Sign Out, then sign in at `/auth?mode=signin`. Stay on `/` for more than 2 s, three times out of three.
  2. Open `/setup`; it should land on `/settings`.
  3. With the old build's SW installed, rebuild with a change and reload. The first navigation should serve the new `index-*.js`, with no reload loop.
- After deploy: `curl -I https://acreledger.vercel.app/assets/does-not-exist.js` returns 404, and `/assets/index-*.js` returns `immutable`.

## Remaining risk
Users whose installed SW is the old cache-first one still boot stale once. They pick up the network-first SW on its next update check, and from then on navigations are fresh.
