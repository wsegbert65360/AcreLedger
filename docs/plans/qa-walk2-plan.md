# QA Walk 2 — Implementation Plan

**Base:** `63d6ddc` (main) on branch `fix/qa-walk2`
**Prior attempt:** `206028a` (`origin/fix/qa-ui-batch-1015`, unmerged). None of the files it touches have
changed between its parent and `63d6ddc`, so its hunks apply cleanly. This plan says, for each bug, which
hunks to reuse and where it goes further.

**Constraints:** UI/client only. No DB, Supabase, Vercel, Stripe, or env/config changes. Gate: `npm run lint`,
`npm run typecheck`, `npm run test:unit`.

**Out of scope:** Do not carry over the parts of `206028a` that no bug here asks for: the Activity chip-row
scroll fade (`useCanScrollFurtherRight`, `activity-types-fade` test) and the `Reports.tsx` season-row
tweak. Exception: the `Reports.tsx` `SeasonSelect` className must still be checked under the new width rules
in Bug 2.

---

## Bug 1 — Dashboard weather card stuck on "Loading…" with no location

**Root cause:** `src/components/WeatherWidget.tsx` (`WeatherBar`) shows "Loading…" whenever
`!hasData && !weather.isError`. When there is no saved zip, no field coordinates, and no cached GPS fix:
- on native the effect returns early (line 79), and
- on web `resolveCoords` can return an empty `locationString`.

In both cases `zip` stays `''`, `load()` never runs, and the card never leaves "Loading…". `/weather`
(`src/pages/Weather.tsx` lines 396–405) handles the same case with an inline "No Location" panel and a zip
search form (lines 344–384).

**Reusable pieces (new files in `src/components/weather/`):**

1. `WeatherNoLocation.tsx` — default export. Takes the dashed panel markup from `Weather.tsx` 397–405
   (MapPin, "No Location" heading, help text).
   - Props: `{ compact?: boolean; description?: string; children?: ReactNode }`.
   - `compact` uses smaller padding and icon (`py-4`, `size={24}`) so it fits the dashboard card.
   - `children` renders below the text, so the dashboard can put the search form inside.
2. `WeatherLocationSearch.tsx` — default export. Takes the form from `Weather.tsx` 345–383.
   - Props: `{ value; onChange(v); onSubmit(loc: string); error?: string; disabled?: boolean; onUseGps?: () => void; usingGps?: boolean; inputId: string }`.
   - Render the GPS (Crosshair) button only when `onUseGps` is passed.
   - Give the input a real `<label className="sr-only">Zip code or coordinates</label>`.
3. `src/lib/weatherHelpers.ts` — add `parseWeatherLocationInput(raw: string): { ok: true; value: string; coords: { lat: number; lng: number } | null } | { ok: false; error: string }`.
   - Use it in place of the duplicated validation in `Weather.tsx` `handleLocationSubmit` and `WeatherWidget.tsx` `handleSubmit`.
   - Error strings: `'Enter a zip code or coordinates'` (empty input) and `'Enter a valid 5/9-digit zip or lat,lng'` (the `/weather` wording).

**`Weather.tsx` changes:**
- Swap the inline form and the inline No Location block for the two new components.
- No change in behavior or visuals. Keep the existing classes by passing them through the components or making them the components' defaults.

**`WeatherWidget.tsx` changes:**
- Add `const [locationStatus, setLocationStatus] = useState<'resolving' | 'resolved' | 'none'>('resolving')`.
- In the location effect:
  - Every branch that calls `setZip(...)` also sets `'resolved'`.
  - After `initialFetchComplete`, set `'none'` when:
    - native (the current early return), or
    - `resolveCoords` resolves with an empty `locationString`, or
    - `resolveCoords` rejects.
  - Before `initialFetchComplete`, stay `'resolving'` so the card does not flash "No location" during hydration.
- When `locationStatus === 'none' && !zip`, render a different card:
  - Same outer card styling and `id="coachmark-weather"`.
  - **Not** `role="button"`, no `onClick` navigation (a form must not sit inside a button).
  - Contents: `<WeatherNoLocation compact description="Enter a zip code or coordinates, allow location access, or add field coordinates.">` wrapping `<WeatherLocationSearch inputId="weatherZipEmpty" …/>`.
  - Submit runs the existing `handleSubmit` path: `saveZip`, then `setZip`, then `'resolved'`. The normal card then returns and shows "Loading…" until the fetch lands.
- Fields that hydrate later with coordinates change `fieldCoordsKey`. The effect re-runs, sets `zip`, and sets `'resolved'`, so the card recovers without a reload.
- Leave the populated card's inline `Zip...` input as is.

**Tests:**
- `src/components/__tests__/WeatherWidget.test.tsx`
  - Turn the `loadZip` mock into hoisted state (`zipState.saved`), plus `initialFetchComplete` in `farmState`.
  - Mock `loadCachedWeatherCoords`, `resolveCoords`, and `@/lib/native` `isNativePlatform` as needed.
  - Cases:
    - No saved zip, no fields, no cache, native → "No Location" heading and the zip input render; "Loading…" does not; `fetchCurrentWeather` is not called.
    - Same, web, `resolveCoords` resolves `{0,0,''}` → "No Location".
    - `initialFetchComplete: false` and no location → "Loading…", not "No Location".
    - Typing `72301` and submitting → `saveZip('72301','user-1')` is called, `fetchCurrentWeather` is called with `'72301'`, and the normal card renders.
    - Invalid input `abc` → error text shown, no fetch.
    - Clicking the No Location card does not call `navigate`.
- `src/lib/__tests__/weatherHelpers.test.ts`: `parseWeatherLocationInput` cases — empty, 5-digit, 9-digit (`12345-6789`), `lat,lng`, invalid.
- `src/pages/__tests__/Weather.test.tsx`: no new page-level test is required. If an existing test covers the search form, it must still pass.

---

## Bug 2 — Season selector ~364px wide at 400px, pushes "Manage" off-screen

**Root cause:** The `SelectTrigger` base class (`src/components/ui/select.tsx` line 20) includes `w-full`.
`SeasonSelect`'s default variant only adds `min-w-[5.25rem] shrink-0`, so it fills its flex row.

**Fix — reuse the `206028a` hunks:**
- `src/components/SeasonSelect.tsx`:
  - Base: `'h-11 min-w-0 max-w-full shrink rounded-lg … [&>svg]:shrink-0'`.
  - Default variant: `'w-auto max-w-[6.5rem] border-border bg-muted/60 text-foreground'`. The sidebar variant keeps `w-full`.
  - Inner span gets `overflow-hidden`; the year span gets `truncate`.
- `src/pages/Index.tsx` (header lines 185–228): reuse the `206028a` hunk.
  - Header container gets `min-w-0`; `h1` gets `truncate`.
  - Both season rows get `min-w-0`; the "N fields" span gets `shrink-0`.
  - `SeasonSelect` className becomes `max-w-[6.5rem] shrink …`, replacing `min-w-[4.75rem]` / `min-w-[5.5rem]`.
- `src/pages/Activity.tsx` header (lines 341–354): reuse the `206028a` header hunk only (`min-w-0`, `truncate`, `shrink-0` icon box, and the `SeasonSelect` className). Bug 3 depends on this.
- `src/pages/Reports.tsx` line 555: `w-[5.5rem]` is already fixed width. Leave it unless the new base classes break it; it should not change.

**Tests:**
- New `src/components/__tests__/SeasonSelect.test.tsx`. Mock `useFarm` with `viewingSeason: 2026`, `seasonOptions`, `setViewingSeason`.
  - Default variant trigger (`getByRole('combobox', { name: 'Season' })`) has `max-w-[6.5rem]` and `w-auto`, and does not have `w-full`.
  - Sidebar variant has `w-full`.
  - The year text node has `truncate`.
  - (jsdom has no layout, so the tests check class contracts; do a manual check at 400px.)
- `src/pages/Index.test.tsx`: if it asserts on header markup, update it. Otherwise no change.

**Manual check:** At 400px on `/`, `/activity`, and `/reports`, the season trigger is about 6.5rem wide or less, and the Add field, Ask, and Manage buttons are all visible.

---

## Bug 3 — `/activity` cold load flashes "Offline changes locked — sync status unknown"; "Log Activity" clipped

**Root cause:** `src/store/farmStore.tsx` starts `syncQueueLocked` as `true` (fail-closed, line ~281) until the
first `getPendingCount` resolves. `OfflineBanner` (mounted globally, `App.tsx` line 342) and
`SyncStatusIndicator` treat "locked" as "read failed", so the banner flashes on every cold load. The amber
`?` pill also takes space in the Activity action row.

**Fix — reuse the `206028a` store and banner hunks, with one change to the indicator:**
- `src/store/farmStore.tsx`:
  - Add `syncQueueReadFailed: boolean` to `FarmState`, `useState(false)`, and the provider value.
  - Set `true` only in the two catch paths: the pending-count catch, and the `isOfflineDatabaseUnavailableError` / `WebSyncQueueUnreadableError` snapshot path.
  - Set `false` on a successful read, on the no-identity branch, and on identity reset.
  - **`syncQueueLocked` keeps its current semantics** (fail-closed for sign-out/delete gating). Do not touch its consumers outside these files.
- `src/components/OfflineBanner.tsx`: switch from `syncQueueLocked` to `syncQueueReadFailed = false` (the `206028a` hunk as is).
- `src/components/SyncStatusIndicator.tsx`: use `syncQueueReadFailed` for the amber locked pill. **Deviation from `206028a`:**
  - While the status is unknown (`syncQueueLocked && !syncQueueReadFailed`), do **not** fall through to "All changes synced". That would claim a state we don't know.
  - Instead render a neutral, same-size muted `Cloud` pill with `aria-label="Checking sync status"`, so the layout doesn't shift.
- `src/components/settings/SyncStatus.tsx` line 161: change `syncQueueLocked ? 'locked'` to `syncQueueReadFailed ? 'locked'` so Settings doesn't flash it either.
  - While the status is unknown, fall through to the existing `syncState`.
  - If `syncState` would read as "synced", show `'pending'`/checking copy instead.
  - Confirm the available states when implementing. Keep this change minimal.
- "Log Activity" button: changes in `src/pages/Activity.tsx` lines 359–436.
  - Outer action row: replace `flex-wrap … flex-grow w-full` with `flex min-w-0 w-full items-center justify-end gap-2 sm:w-auto` (no wrap on mobile).
  - Inner button group: `flex min-w-0 items-center gap-1.5` (drop `flex-wrap`).
  - Quick-add button: add `shrink-0 whitespace-nowrap`.
  - `SyncStatusIndicator` wrapper: `shrink-0`.
  - Export buttons keep their short mobile labels and can shrink first.
  - Check at 400px on every tab: All (Log Activity), Spray (EXPORT + Spray), and Plant (FSA + Planting).

**Tests:**
- `src/components/SyncStatus.review04.test.tsx`: reuse the `206028a` changes, but change the new "pending" case to expect `getByLabelText('Checking sync status')` and `queryByLabelText('All changes synced')` to be null. Keep the existing locked case, with `syncQueueReadFailed: true`.
- `src/components/__tests__/SyncStatusIndicator.test.tsx`: add `syncQueueReadFailed` to the mock and cover the read-failed and checking states.
- `src/store/__tests__/farmStore.test.tsx`: reuse both `206028a` additions.
  - The existing locked test asserts `syncQueueReadFailed === true`.
  - The new test: with a never-resolving `getPendingCount`, expect `syncQueueLocked: true` and `syncQueueReadFailed: false`; after it resolves, expect both `false`.
- `src/components/settings/__tests__/SyncStatus.test.tsx`: update mocks for the new flag. Add a case: locked and not read-failed → no "locked" copy.
- `src/pages/__tests__/Activity.test.tsx`: assert the "Log Activity" button has the `shrink-0` and `whitespace-nowrap` classes (layout contract).

---

## Bug 4 — `/logistics` empty-state "Add bin" opens Manage instead of the add form; card overflows at 400px

**Root cause:** In `src/pages/Logistics.tsx` lines 196–199, the empty-state button calls `setManaging(true)`,
which shows the `BinManager` list. The user then has to tap "Add New Bin" again.

**Fix (simpler than `206028a`'s `initialAddOpen` threading):**
- In `Logistics.tsx`:
  - Add `const [addBinOpen, setAddBinOpen] = useState(false)`.
  - The empty-state button calls `setAddBinOpen(true)`.
  - Next to the other modals, render `{addBinOpen && <BinManageModal open onClose={() => setAddBinOpen(false)} />}` (default import from `@/components/BinManageModal`; it's already the add form when `editBin` is absent).
  - After a successful save, `bins` becomes non-empty and the overview renders. Manage mode is never entered.
  - Leave the header Manage toggle unchanged.
  - Do **not** add `initialAddOpen` to `BinManager`. With this change it isn't needed, which avoids a stale-prop issue (the prior attempt had to reset the flag in the Manage handler).
- Card fit at 400px (same block, lines 187–201):
  - Card: `p-8` → `w-full min-w-0 overflow-hidden p-5 sm:p-8`.
  - Button: add `w-full sm:w-auto`.
  - Confirm `BinSiloThumb` has no fixed width wider than about 300px. If it does, wrap it in `max-w-full` / `[&>svg]:max-w-full`.

**Tests — `src/pages/__tests__/Logistics.test.tsx`:**
- Mock `@/components/BinManageModal`: the default export renders `<div role="dialog" aria-label="Add Bin" />` when `open`; also export a `BinManager` stub with `data-testid="bin-manager"`.
- Empty state, click `/^add bin$/i` → the add dialog is present and `bin-manager` is **not**.
- With one bin, clicking the header "Manage bins" button → `bin-manager` renders and the add dialog does not.
- Keep the existing percent test.

---

## Bug 5 — Billing badge says "Not subscribed" next to "free" copy; `/billing` 404s

### 5a. Badge must match the copy
**Root cause:** In `src/components/settings/BillingManager.tsx`, `getStatusBadge(subscription)` ignores
`allowlisted`. Users who aren't allowlisted see "Billing is coming soon. AcreLedger is free…" next to a
"Not subscribed" badge. Also, before the `farm_subscriptions` query resolves, `subscription` is `null`, so
allowlisted trialing users briefly see "Not subscribed".

**Fix:**
- Change the signature to `getStatusBadge(subscription, { allowlisted })`. The phase-to-label mapping lives in this file only, alongside `getFarmBillingAccess` (no change to `lib/billing.ts`).
  - `!allowlisted` → `{ label: 'Free', className: 'bg-plant/10 text-plant border-plant/20' }`.
  - `trialing` → 'Free trial' (unchanged).
  - `active`, `past_due`/`unpaid` → unchanged.
  - Allowlisted with no row or a soft-deleted row → 'Not subscribed' (matches "No billing subscription for this farm yet.").
  - `canceled` → 'Canceled'; `incomplete` → 'Not subscribed'. These match `getStatusLine`.
- Add `const [subscriptionLoaded, setSubscriptionLoaded] = useState(false)`.
  - Set it `true` in the query `.then` (both the data and error branches) and in the `!farm_id || !userId` branch.
  - Reset it to `false` when `farm_id`/`userId` change.
  - For allowlisted users, render the `Badge` only when `subscriptionLoaded`. Non-allowlisted users get 'Free' immediately; it doesn't depend on the row.

**Tests — new `src/components/settings/__tests__/BillingManager.test.tsx`:**
- Mock `useFarm` (session plus `farm_id`), `@/lib/supabase` (a chainable `from().select().eq().is().maybeSingle()` that resolves to a controllable row), and `@/lib/billing`.
  - `isBillingUiAvailable` → true.
  - `fetchBillingEligibility` → controllable (server allowlist via `GET /api/billing-eligibility`).
- Cases:
  - Not allowlisted → the badge reads "Free" next to the "free for your farm" copy, and "Not subscribed" is absent.
  - Allowlisted, trialing row → "Free trial", plus the trial copy.
  - Allowlisted, no row → "Not subscribed", plus "No billing subscription for this farm yet."
  - Allowlisted, query pending → no "Not subscribed" badge.

### 5b. `/billing` → Settings billing section
**Fix — reuse the `206028a` hunks:**
- `src/App.tsx`:
  - Add `BillingSettingsRedirect` (`<Navigate to={isBillingUiAvailable() ? '/settings?section=billing' : '/settings'} replace />`).
  - Register `/billing` and `/subscription` routes next to `/settings` in the signed-in `AnimatedRoutes`.
  - Signed-out users already land on `/` via the line 318 catch-all; leave that unchanged.
- `src/pages/Settings.tsx`:
  - Add `useSearchParams`, `SETTINGS_SECTIONS`, `settingsSectionFromQuery`, keyed `Accordion` `defaultValue={openSections}`, `id="settings-section-*"` + `scroll-mt-24` on items, and a `scrollIntoView({ block: 'start' })` effect.
  - `?section=billing` is ignored when billing UI is unavailable (native, or flag off).
  - The `BillingManager` Stripe-return `?billing=` handling is a different param; no conflict.

**Tests (reuse `206028a`):**
- `src/App.test.tsx`: the `./pages/Settings` mock, `vi.unstubAllEnvs()` in `beforeEach`, the `/billing` and `/subscription` redirect test, and the native → plain `/settings` test.
- `src/pages/__tests__/Settings.test.tsx`: `renderSettings(path)` plus three cases:
  - `?section=billing` opens and scrolls.
  - An unknown section keeps the default.
  - Native: billing is not opened.
- Before adding the `./pages/Settings` mock in `App.test.tsx`, confirm no existing test in that file renders the real Settings.

---

## Order of work and verification
1. Bug 5b, then 4, then 2. These are mechanical reuses of `206028a` plus the Logistics simplification.
2. Bug 3 (store flag, indicator, Activity row).
3. Bug 5a (badge).
4. Bug 1 (component extraction plus widget state). This is the largest change and the only refactor.
5. Run `npm run lint`, `npm run typecheck`, `npm run test:unit`. All three must pass.
6. Manual check at 400×860 in the browser (`npm run dev`):
   - `/` with no zip, no fields, and location denied → the No Location card. Entering `72301` loads weather.
   - Season trigger is narrow and Manage is visible.
   - `/activity` cold reload → no amber banner. "Log Activity" is fully visible.
   - `/logistics` with no bins → "Add bin" opens the add dialog, and the card has no horizontal scroll.
   - `/billing` → Settings with Billing open; the badge matches the copy.

## Risks
- **Bug 1:** On web, `resolveCoords` can wait up to 5s for a geolocation prompt. The card correctly stays on "Loading…" during that wait, and it only reaches No Location if the prompt is dismissed or denied.
- **Bug 1:** If `initialFetchComplete` never becomes true (for example, a hung fetch), the card stays on "Loading…". That is unchanged from today.
- **Bug 3:** `syncQueueLocked` must keep gating sign-out and deletion. Only the display surfaces move to `syncQueueReadFailed`.
- **Bug 2:** The width checks are class-contract tests; jsdom can't measure layout, so the manual 400px check is required.
