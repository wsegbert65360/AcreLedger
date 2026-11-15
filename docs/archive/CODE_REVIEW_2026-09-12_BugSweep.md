# Code Review — Bug Sweep (2026-09-12)

**Scope:** whole application, bug-focused. `src/` plus `api/` and `server/`.
**Mode:** review only. Findings 1–3 were fixed by the owner afterward in the working tree
(uncommitted); finding 4 was **retracted** as incorrect. See *Fix status* at the end.
**Reviewed:** `main` @ `cb58f05` (working tree clean at review time — this is a review of
committed code, not of a diff).

## Summary

**No high-severity or data-loss bugs found.** The hardening documented in `AGENTS.md` is genuinely
implemented: soft delete only, farm/season scoping on every mutation, no `.select()` after
update/soft-delete, all-season bin inventory, sanctioned FSA/CLU upsert conflict keys, and
fail-closed billing and AI-assistant boundaries.

Three real defects are recorded below — one robustness crash in the CLU import path, one
cross-cutting date-parsing inconsistency, and one minor divergence. A fourth finding was
raised and then retracted; it is kept here only so nobody acts on it.

### Finding index

| # | Severity | Area | File | Line | Status |
|---|----------|------|------|------|--------|
| 1 | Medium | CLU / FSA import | `src/lib/cluImport.ts` | 21 | Fixed |
| 2 | Low | Date handling (7 sites) | multiple | see below | Fixed |
| 3 | Low | Optimistic rollback | `src/store/useFieldsAndBins.ts` | 541, 559, 567, 734, 752, 760, 928, 946, 954 | Fixed |
| 4 | — | CLU / FSA import | `src/lib/cluImport.ts` | ~~265–274~~ | **Retracted** |

---

## 1. `isWebMercator` can throw `TypeError` on a degenerate polygon — crashes GeoJSON import

**Severity: Medium** — `src/lib/cluImport.ts:21`

```ts
const firstPoly = (coords.length > 0 && Array.isArray(coords[0][0][0])) ? coords[0] as number[][][] : coords as number[][][];
```

`coords[0][0][0]` dereferences three levels with only `coords.length > 0` guarded. For a Polygon
with an empty ring — `"coordinates": [[]]` — `coords[0][0]` is `undefined`, so `undefined[0]`
throws `TypeError: Cannot read properties of undefined`.

`isPolygonFeature` only requires `Array.isArray(coordinates)`, so that shape passes the feature
filter and reaches this line. Both call sites (`:194` and `:284`) sit **outside** the `try/catch`
that wraps `JSON.parse`, so the import fails with an unhandled `TypeError` instead of the intended
actionable guidance ("Ask FSA for a complete file …").

The ZIP path is unaffected: `coordsWithinWgs84` short-circuits on empty arrays, so only
`.json` / `.geojson` imports can hit this.

**Fix shape:** bounds-check before indexing, e.g.
`Array.isArray(coords[0]?.[0]) && Array.isArray(coords[0][0][0])`, or wrap the projection probe
in the existing try/catch and surface the standard "unidentifiable coordinate system" message.

---

## 2. Date-only strings still parsed as UTC in seven places

**Severity: Low** — cross-cutting

`AGENTS.md` requires `parseLocalDate` / `getWorkDateMs` from `@/utils/dates` for date-only strings.
`new Date('YYYY-MM-DD')` parses at UTC midnight, which is one day early in `America/Chicago`
(the deployment timezone named in the owner-DR design).

| Site | Impact |
|------|--------|
| `src/lib/utils.ts:22-23` (`getLatestForField`) | Picks the "suggested record" prefill for **all 8 activity modals** |
| `src/lib/complianceReports/generateLandlordSummary.ts:122-127` (`dateSortKey`) | Drives the landlord **Activity Timeline order** and the "latest crop" label; 9 call sites (lines 154, 159, 203, 215, 227, 239, 251, 263, 276) |
| `src/lib/complianceReports/fsaReports.ts:188` (`plantSortTime`) | Planting order in FSA-578 rows |
| `src/components/PlantModal.tsx:79` | Duplicate-planting warning source |
| `src/pages/Activity.tsx:266` | Synthetic feed timestamp for fertilizer rows |
| `src/pages/Reports.tsx:151,156,161` | Fertilizer / tillage / custom-spray ordering |
| `src/lib/complianceReports/generateLandlordStatement.ts:32,205` | Legacy harvest-only statement (tests only, no longer rendered) |

**Why this is Low, not Medium:** within a collection where every value is a plain date-only string,
the shift is uniform, so relative order is preserved. The real failure mode is a *mixed*
comparison — a record with a date field (UTC-parsed) versus a record falling back to `timestamp`
(true local epoch ms) — which can select the wrong "latest" record or mis-order a timeline by up to
roughly 19 hours in Central time.

Note the internal inconsistency in `generateLandlordSummary.ts`: its own `formatDate` (line 109)
correctly uses `parseLocalDate` and documents exactly this hazard, while `dateSortKey` 13 lines
below it does not.

**Fix shape:** route these through `getWorkDateMs` / `compareWorkDateDesc`, which already exist for
this purpose and are used by `Activity.tsx`'s filters.

---

## 3. Rollback re-appends to the end of the list instead of restoring position

**Severity: Low** — `src/store/useFieldsAndBins.ts` (9 sites)

```ts
if (previous) setSavedSeeds(prev => [...prev, previous]);   // appended
```

The pattern appears in each of the three failure branches (online-error, offline-enqueue, and
network-throw) of `deleteSeed` (`:541`, `:559`, `:567`), `deleteSprayRecipe` (`:734`, `:752`,
`:760`), and `deleteFertilizerRecipe` (`:928`, `:946`, `:954`). A failed delete silently moves the
record to the end of the array.

Every sibling mutation does index-preserving restore — `deleteField`
(`useFieldsAndBins.ts`), all of `useGrainMovements`, and the plant / spray / harvest / hay / tillage
hooks all use `restored.splice(insertAt, 0, record)`. Cosmetic only (these lists are small and
usually re-sorted for display), but an unintended divergence from the established rollback pattern.

---

## 4. ~~Dead branch in tract-key parsing~~ — RETRACTED

**This finding was wrong, on both the location and the analysis. No action required — do not
delete the branch.**

- The cited lines (`265–274`) are the `JSON.parse` block in `parseCluGeoJsonTracts`, not the
tract-key parser. The real code is `filenameTractKey`, lines **`305–314`**.
- `/(\d+)[-_](\d+)/` **cannot** match `F4251_T9747_HENSLEE`. The regex needs digits, then `-` or
  `_`, then more digits. After the first `_` comes `T`; after the second `_` comes `H`. Neither
  run completes, and backtracking shorter digit prefixes cannot repair it (`4251` → `_` → `T`
  fails; `425` → `1` is not a separator; and so on). So the preceding `match` returns `null` and
  the `^F(\d+)_T(\d+)` branch **does** run.
- The pattern is already covered by tests: `src/lib/__tests__/cluImport.test.ts:170`
  ("handles F{farm}_T{tract} filename pattern") asserts
  `F4251_T9747_HENSLEE.json → 4251-9747`. `:163` (`F918_T1327_MEFFORD.json → 918-1327`) and
  `:200` exercise the same branch.

The error came from pattern-matching the regex by eye instead of running it — the generic
numeric pattern and the `F`/`T` pattern are genuinely non-overlapping, and the branch is live.

---

## Verified clean

Checked deliberately; no issues found.

### Data safety
- **Hard deletes:** zero `.delete()` calls anywhere in `src/`.
- **Farm scoping:** every `.update()` chain carries `.eq('farm_id', …)`. The only unscoped writes
  are `profiles` own-row updates (`onboarding_complete`, `active_season`), which is the sanctioned
  exception; `.eq('id', userId)` is present on both.
- **No `.select()` after update or soft-delete** — all paths use `{ count: 'exact' }` plus row-count
  verification, including the reconciled zero-row path in `syncQueue.reconcileZeroRowMutation`.

### Grain
- `mapGrainFromDb` defaults legacy versionless rows to `version: 1` (`mappers.ts:263`).
- `version` is stripped from update payloads before **both** the online update and the queued
  offline replay, so the database-managed column is never clobbered by the client.
- The optimistic snapshot is captured from the render closure, not mutated inside a state setter —
  matching the documented `useGrainMovements` reference pattern.
- `getBinTotal` call sites (`DashboardStats.tsx:122`, `Logistics.tsx:133`, `SellModal.tsx:33`) all
  omit the season argument, correctly returning the all-season physical inventory.

### Sync queue / offline
- `enqueueMutations` is used for all bulk and cascading batches; the web path serializes through
  `webQueuePromise` and rethrows, so hook rollback is reachable.
- Corrupt web queue blobs are quarantined rather than silently treated as empty.
- Timestamp reconciliation compares instants after strict ISO validation; recursive equality is
  retained for all non-timestamp values.

### FSA / CLU
- Sanctioned upsert conflict keys are correct in the services, in the replay path, and in the
  offline enqueue (`farm_id,tract_key` and `farm_id,tract_key,clu_number`).
- Mappers emit `deleted_at: null`, so a soft-deleted tract or assignment is genuinely restored on
  re-import or re-assignment.
- `syncFieldAcreageAndClus` touches only `cluNumbers` and never overwrites boundary/manual acreage.

### Season and auth
- Rollover requires `initialFetchComplete`, no fetch error, and `pendingSyncCount === 0`; the
  backup is schema-validated before download; the profile update requires `count === 1`;
  `getNextRolloverSeason` advances exactly one year capped at `currentYear + 1`.
- `useAuth` clamps remote season changes through `resolveRemoteViewingSeason` and rejects invalid
  values rather than applying them.

### Billing (`api/`, `server/billing.ts`)
- Origin allowlists fail closed (empty allowlist ⇒ 403 for any request carrying an `Origin`).
- Test-mode gate rejects any non-`sk_test_` key and any `BILLING_LIVE_CHARGES` other than `false`.
- Owner gates (`canStartCheckout`, `canOpenPortal`) and state-derived idempotency keys are in place.
- `return_url` / `success_url` origins are allowlist-validated before being used.
- Profile and subscription read errors return 500 rather than proceeding unauthenticated.

### AI assistant
- All three `farmScope` variants (`farm_id`, `farm_primary_key`, `field_relation`) are applied in
  `buildFarmQuery`; no unfiltered query path exists, and `FarmScope` is a closed union.

### Reporting
- The landlord export fingerprint deliberately excludes `generatedAt`, so there is no perpetual
  "changed since export" false positive.
- Report readiness findings are advisory and do not disable export.

---

## Coverage note

This was a **targeted sweep, not a line-by-line read of all ~620 files.** Depth was greatest in the
store/hook layer, offline sync, mappers, backup/restore, season scoping, the billing and
AI-assistant functions, and the report/export layer.

Areas **not** reviewed in depth, and worth a follow-up pass if desired:

- `src/components/TractAssignmentFlow.tsx` (beyond `syncFieldAcreageAndClus`)
- most of `src/components/reports/*`
- `src/lib/workRequests/*` and the work-request pages
- `src/lib/speech.ts` / `src/hooks/useAskVoice.ts`
- `src/lib/weatherHelpers.ts` and the rainfall merge in `src/services/RainService.ts`
- theme and `src/index.css` work

## Fix status

All three remaining findings were applied in the working tree (uncommitted) on 2026-09-12:

| Finding | Change |
|---------|--------|
| 1 | `isWebMercator` now optional-chains `coords[0]?.[0]` and skips non-array rings/points. Regression test added: *"does not throw on a polygon with an empty ring"* (`cluImport.test.ts`). |
| 2 | New `workDateMs` helper in `lib/utils.ts` backs `getLatestForField`; the other six sites now use `getWorkDateMs` / `compareWorkDateDesc`. Coverage added in `lib/utils.test.ts` and `generateLandlordSummary.test.ts`. |
| 3 | New `restoreAtIndex` helper splices the record back at its captured index instead of appending. Test: *"restores a failed seed delete at its original index"*. |
| 4 | **No action — retracted.** |

The fix pass is otherwise complete: no bare date-only `new Date(...)` sorts remain in the paths
listed in §2 (the surviving `new Date(...)` calls all take epoch timestamps or `Date.now()`),
and no `[...prev, previous]` append-rollbacks remain anywhere in `src/`.

### Verification

- `npx vitest run` over the five touched suites — **76 passed**.
- `npm run lint` — **0 errors** (73 pre-existing warnings).
- `npm run typecheck` — **fails**, but for a reason unrelated to these changes; see below.

### Outstanding blocker — intentional deletion, removal not yet finished

`src/pages/Landing.tsx` is **deleted in the working tree**. The owner confirmed on 2026-09-12
that the deletion is deliberate, so **do not restore it**. The removal is incomplete, and until
it is finished the type gate and two test files cannot pass:

```
src/App.tsx(42,21): error TS2307: Cannot find module './pages/Landing'
src/pages/__tests__/Landing.test.tsx(11,21): error TS2307: Cannot find module '../Landing'
```

`App.tsx:42` still imports `Landing` and `App.tsx:204` still routes `/` to it, and the orphaned
`src/pages/__tests__/Landing.test.tsx` still exists. Finishing the removal means updating the `/`
route and its import in `App.tsx` and deleting the now-dead test file.

This is **not** caused by the review or by the §1–§3 fixes. Everything else is green:
`npm run test:unit` reports **1137 passed**, and the only 2 failing files are the two named
above. `npm run lint` is at 0 errors.
