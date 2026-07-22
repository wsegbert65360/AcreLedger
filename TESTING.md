# Testing Procedures

This document outlines the testing protocols for the AcreLedger project.

## Test Commands

```bash
npm run test            # unit suite (default; excludes integration tests)
npm run test:unit       # explicit alias of the unit suite
npm run test:watch      # unit suite in watch mode
npm run test:integration # live-credential/network tests only (Rain API, bot auth)
npm run test:coverage   # unit suite with V8 coverage collection
npm run typecheck       # tsc -b (authoritative type gate; build/SWC does not typecheck)
npm run lint            # eslint (0 errors gate; warnings tracked separately)
npm run build           # vite build (bundle gate)
```

### Unit vs. Integration Separation

- **Unit suite** (`npm test` / `test:unit`): excludes `**/*.integration.test.{ts,tsx}` and preserves Vitest's default exclusions. This is the CI gate.
- **Integration suite** (`test:integration`): runs only `*.integration.test.*` via `vitest.integration.config.ts`. These hit live services and require credentials/network:
  - `src/services/__tests__/RainService.integration.test.ts` — real Rain API (skips when `import.meta.env.VITE_RAIN_API_URL` is unset).
  - `src/lib/__tests__/auth.integration.test.ts` — bot auth + farm_id resolution (skips via `describe.skipIf` when `TEST_BOT_EMAIL`/`TEST_BOT_PASSWORD` are absent). These non-public vars live in `.env.test.local` and are loaded into `process.env` by `vitest.integration.config.ts` (Vitest does not load that file automatically).

## Automated Logic Tests

We use **Vitest** for unit testing core logic, mappers, and compliance report generation.

```bash
# Run all unit tests once
npm test

# Run specific service/utility tests
npm test src/services/__tests__/RainService.test.ts
npm test src/utils/utils.test.ts
```

### Supabase-backed unit tests

Use `src/test/supabaseMock.ts` instead of rebuilding chain mocks in each suite. The
canonical lifecycle is one stable mock and one dynamic system-under-test import per
suite:

```ts
const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));

let service: typeof import('../fieldService');
beforeAll(async () => {
  service = await import('../fieldService');
});
beforeEach(() => mock.reset());
```

- Do not call the imported factory from `vi.hoisted`; it is not initialized at mock-hoist time.
- Query chains are thenable and resolve through `setResult`/`setThrow`.
- Every `from(table)` call receives a table-bound builder. `setTableHandler` therefore remains safe when different tables are queried concurrently with `Promise.all`.
- RPC results and throws are controlled independently with `setRpcResult` and `setRpcThrow`.
- `reset()` uses `mockReset()` and reinstalls all implementations, clearing queued behavior and terminal state between tests.
- Add another mocked chain method only when production code under test requires it.

For mutation hooks, use `useStatefulArray` from `src/test/hookTestHarness.tsx` inside the same `renderHook` callback as the hook under test. Plain `vi.fn()` setters do not execute functional updates, so they cannot verify optimistic append, rollback, or original-index restoration.

The Phase 1 service suites are:

- `cluAssignmentService.test.ts` — update/remove scoping plus the sanctioned CLU conflict-key upsert.
- `fsaTractService.test.ts` — import/fetch/delete RPC and the sanctioned tract conflict-key upsert.
- `fieldAndBinServices.test.ts` — create/update query contracts, bin soft-delete scoping, and the atomic field/CLU soft-delete RPC contract.
- `supabaseMock.test.ts` — thenable, rejection, RPC independence, reset, and concurrent table-isolation contracts.

The Phase 2 safety suites include:

- `useFieldsAndBins.test.tsx` — exact-count rollback and atomic field/CLU offline deletion.
- `useGrainMovements.test.tsx` — insert/update/delete rollback, concurrency fingerprints, locking, and atomic offline deletes.
- `useFsaTracts.test.tsx` — import/assignment rollback plus tract and CLU cascades.
- `activityHookConformance.test.tsx` — closure-snapshot rollback and atomic offline bulk-delete behavior across all seven activity hook families.
- `useAuth.test.tsx` / `useSeasonRollover.test.tsx` — realtime/recovery season synchronization, Supabase sign-out, and queue-aware local cleanup.

## Coverage Baseline

Updated 2026-07-19 after the Phase 2 hook safety suites via `npm run test:coverage` (V8 provider). Scope is production
sources only — see the `coverage` block in `vite.config.ts`. No thresholds are set
yet (Phase 0 records the baseline; a conservative global floor is added after the
hook/service tests land).

| Metric      | Covered | Total | %     |
|-------------|---------|-------|-------|
| Statements  | 9,139   | 23,963| 38.13 |
| Branches    | 1,913   | 2,841 | 67.33 |
| Functions   | 329     | 554   | 59.38 |
| Lines       | 9,139   | 23,963| 38.13 |

Observations driving the test roadmap:
- Mutation hooks now have direct stateful coverage; remaining store coverage gaps should be prioritized by risk rather than file count alone.
- `fieldService`, `binService`, `fsaTractService`, and `cluAssignmentService` now have 100% statement/branch/function/line coverage; the services aggregate is 85.97% statements.
- Strong areas: pure lib (`mappers`, `fieldAcreage`, `geoHelpers`, `crypto`), `utils/`, `RainService`.
- The exact file/test count is a moving snapshot; the command exit status is the gate. Update the coverage table only from a completed `npm run test:coverage` run.

## Coverage Remediation Roadmap (v2, adopted 2026-07-21)

Baseline at adoption: 585 tests / 60 files; 38.13% statements / 67.33% branches / 59.38% functions.

Working agreements (all phases):

- Test-only changes. If a new test reveals a production bug, **stop and report** before fixing.
- Repo patterns: `createSupabaseMock()` lifecycle (`vi.doMock` + dynamic import in `beforeAll` + `reset()` in `beforeEach`), `useStatefulArray` for hook state, full-collection `useFarm` mocks in modal tests, `waitFor` for async renders.
- The unit suite stays offline-only. Anything hitting a live API goes in `*.integration.test.*`.
- Gate per phase: `lint` (0 errors) → `typecheck` → `test` → `test:coverage`; the baseline table is updated only from a completed coverage run.
- New shared scaffolding lives in `src/test/` (excluded from coverage, like `supabaseMock.ts`).

### Phase 0 — Hygiene & gate

- [x] Delete placebo `src/pages/__tests__/FieldDetailScreen.test.tsx` (it never imports the component; a real render test lands in Phase 5).
- [x] Fix `act()` warnings in `SprayModal.test.tsx` (await async weather updates via `act`/`waitFor`).
- [x] Add global coverage thresholds in `vite.config.ts` just below baseline: statements 37 / branches 66 / functions 58 / lines 37.
- [x] `RainService.debug.test.ts` cleanup: fold offline-mock cases into `RainService.test.ts`; the conditional real-API case moves to `RainService.integration.test.ts` (or is removed if duplicated). Never in the unit suite.

### Phase 1 — Compliance PDF generators (hybrid strategy)

- [x] `src/test/jspdfMock.ts` — `vi.mock('jspdf')` + `jspdf-autotable` capture harness (`text`/`addImage`/`save`/`autoTable` args). Semantic assertions only.
- [x] `sprayExport.test.ts` → `generateSprayPDF` (mock-based): per-record row groups with multi-product expansion; `[ATTACHMENT:…]` token → `addImage` called and raw base64 never passed to `text()`; non-compliant/omission states render warning + "Review needed"; treated-acreage fallback via `getEffectiveSprayTreatedAcres` (FSA cropland wins; stored partial-field value preserved); sanitized filename on `save()`. (13 tests; file now 82.67% stmts)
- [x] `fsa578PdfExport.test.ts` → `exportFsa578WorksheetPdf` (mock-based): canonical section order (entry rows → reconciliation → review items/correction lines → All-CLU Reference); non-cropland CLU absent from entry table, present in appendix as reference-only; readiness issues rendered; clean report still states county FSA review required; disclaimer wording intact. (9 tests; file now 93.68% stmts / 100% funcs)
- [x] Real multi-page FSA-578 generation test (deterministic, no jsPDF mock): jsPDF v4 binds `save` per instance, so the doc is captured via a subclass that re-assigns instance `save`; 60 fixed rows force ≥4 pages; asserts continuation header, per-page footers, `Page X of Y`, continuation content.
- [x] `pdfExport.test.ts` → `exportToPdf` (mock-based): subtitle includes farm name; long footer wrapped via `splitTextToSize`; `save()` called. (6 tests; file now 99.04% stmts / 100% funcs)
- Exit: required document invariants break a test. Incidental spacing/whitespace changes must not — no pixel/layout assertions.

### Phase 2 — farmStore composed behaviors (behavior-pinned, no coverage quota)

Provider-level tests in `src/store/__tests__/farmStore.test.tsx`, limited to genuinely composed responsibilities. Restore is excluded — it belongs to `useSeasonManagement` (Phase 6c).

- [x] `getBinTotal`: no-season arg returns all-season total including prior-season carryover; season arg scopes. (Pinned via offline-cache hydration fixtures; soft-deleted movements excluded.)
- [x] Fail-closed `signOut` composition: `clearLocalCache` failure → auth `signOut` not called; success → called.
- [x] `fetchData`: returned table error → `toast.error` + `fetchError` + `false`; rejected query caught by the outer `catch` → `fetchError` + `false` (no toast — known asymmetry at `farmStore.tsx:383–386`, pinned with a comment; stop-and-report item for a product decision); offline short-circuit never touches Supabase. Note: the viewingSeason clamp-on-load lives in `useAuth` (already covered by `useAuth.test.tsx`), so store-level season coverage is `selectViewingSeason` validation instead.
- [x] Viewing-season state transitions (`selectViewingSeason` accepts in-window, rejects out-of-window with feedback).
- Result: `farmStore.tsx` 5.86% → 90% statements; all seven activity hooks ~45% → 72–76% statements.

### Phase 3 — Activity-hook conformance extension (7 families × 5 behaviors)

Farm-guard behavior is already covered for `useGrainMovements` and `useFsaTracts`; the gap is the seven conformance families (plant, spray, harvest, hay, custom spray, tillage, fertilizer). Extend the table-driven matrix in `activityHookConformance.test.tsx`:

- [x] Farm guard — `farm_id: null` → `false`, no state change, no Supabase call, mapper never invoked.
- [x] Mapper/season seam — `mapXToDb` called; mapped object carries `seasonYear === viewingSeason` (+ `farm_id`, `deleted_at: null`).
- [x] Optimistic add success — append visible with stamped `id`/`seasonYear`/`farm_id`, insert issued to the right table, `true`.
- [x] Add rollback — Supabase error → append removed, `false`.
- [x] Soft-delete count mismatch — `{ count: 0 }` → rollback (RLS `.select()` trap regression guard).
- Exit met: all seven activity-hook families cover those five behaviors (suite now 51 tests). Out of scope (not claimed): unexpected exceptions, offline enqueue success paths, validation failures, `onMutation` callback behavior.

### Phase 4 — Modal fleet

- [x] `PlantModal.test.tsx` + `FertilizerModal.test.tsx`: acreage defaults mirror the three SprayModal CLU-hydration cases (default = `getDisplayFieldAcres`, CLU-hydration refresh updates untouched default, manual edit/stored values preserved). (PlantModal 84.78%, FertilizerModal 77.05% stmts)
- [x] Duplicate-mode conformance across modals (`activityModalDuplicateConformance.test.tsx`): viewingSeason badge shown, today/fresh-timestamp stamped, `addXxx` called (never `updateXxx`), hook stamps identity. Covers Harvest, Hay, Tillage, CustomSpray, and GrainMovement modals (Plant/Fertilizer duplicates live in their own suites). Note: HarvestModal is the sanctioned exception — it pre-generates `id`/`timestamp` so the linked grain movement can reference them; the test pins that both are *fresh* and `seasonYear`/`farm_id` remain hook-stamped.
- [x] `SellModal.test.tsx`: inventory checked via `getBinTotal(bin.id)` with **no season argument** (asserted on every call); oversale blocked (button disabled + warning + no write); sale covered by prior-season carryover allowed. (SellModal 95.55% stmts)
- Mock shape per canonical `SprayModal.test.tsx` (every collection the modal reads).
- Gate note: the `functions` floor was recalibrated 58 → 57 — V8's static estimate for never-loaded files undercounts functions, and precisely instrumenting the modal fleet grew the denominator (statements rose +5.9pts in the same run; no previously-covered function was lost). See `vite.config.ts`.

### Phase 5 — Pages & routing invariants

- [ ] `Activity.test.tsx`: `?tab=spray` selects the tab; `?record=…&type=…` opens the matching editor once via `editingRecordType` (works from the All tab); spray review-queue filter stays season + search + pending-delete scoped.
- [ ] Real `FieldDetailScreen.test.tsx` (replaces placebo): season-filtered unified feed; canonical section order smoke check.
- [ ] `Reports.test.tsx` (light): mobile export-first panel renders; full preview stays `lg`-only.

### Phase 6 — Infra & settings (corrected ownership)

- [ ] `utils/backup.test.ts` — `exportDataAsJson` mechanics only: browser anchor + Blob URL, deferred `URL.revokeObjectURL` cleanup, native delegation to `native.shareFile`, serialization failure → `false`. No schema assertions here — this module never validates.
- [ ] `BackupManager.test.tsx` — the validation owner (`BackupManager.tsx:109`): schema-valid payload reaches `exportDataAsJson`; schema-invalid payload blocks export with error toast; success toasts + updates `lastBackup`.
- [ ] `useSeasonManagement.test.ts` restore suite: failed `restore_farm_backup` RPC → `false` + error toast + no state mutation; payload rows carry authoritative `farm_id` merge (`farmId` for `fsaTracts`/`cluAssignments`); `resolveRestoredBoundaryAcres` preserves existing DB `operational_acreage`; post-restore `refetchFarmData()` required — its failure returns `false` with the "saved but reload failed" message; invalid `activeSeason` rejected before the RPC.
- [ ] `native.test.ts` — per-fallback, not blanket no-op: geolocation delegates to `navigator.geolocation` on web and rejects when unsupported; `shareFile` returns `false` on web without touching Filesystem; `sharePdf` calls `pdfDoc.save()` on web; haptics/statusBar no-op on web; `sanitizeNativeFileName` pure cases.
- [ ] `offlineStorage.test.ts` (get/set/remove + serialization failure), `useNetworkStatus.test.tsx` (event-driven flips), `WeatherService` branch push (proxy resolution, env cleaning, degrade paths).

### Phase 7 — Process & docs

- [ ] Update the baseline table from a completed coverage run; replace roadmap observations with post-plan state.
- [ ] Raise global thresholds to actuals-minus-buffer; add per-file thresholds for the P0 set (`sprayExport`, `fsa578PdfExport`, `pdfExport`). For glob patterns matching multiple files, set `perFile: true` so each matched file must independently pass.
- [ ] Document the SQL/RLS blind spot (migrations, policies, triggers have no automated verification; the manual bot checklist is the interim protocol).
- [ ] Record the Phase 2 `fetchData` exception-path toast asymmetry as a resolved-or-deferred product decision.

## MRMS Edge Function Investigation (Phase 0.5 — historical)

`supabase/functions/mrms-hourly/index.ts` fetches MRMS radar rainfall for every field
and upserts `field_rainfall_hourly`. Security-relevant facts established from the repo:

- It creates its Supabase client with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) and
  selects from `fields` with no `farm_id`/auth scoping.
- It returns CORS headers allowing `POST`, so it was written to be HTTP-invocable.
- It performs **no auth check** on the incoming request beyond the OPTIONS preflight.
- Supabase's default is `verify_jwt = true`; `supabase/config.toml` has **no**
  `[functions.mrms-hourly]` block, so it relies on that default if deployed.
- **No migration schedules it.** The cron schedules in the rainfall migrations are for
  `farm-daily-rainfall-rollup` (a DB function), not `mrms-hourly`. No `pg_net`/DB→function
  invocation of `mrms-hourly` exists in migrations.
- **The client never invokes it** — no `functions/v1/mrms` reference anywhere in `src/`.

**Live deployment check completed 2026-07-18:**
- `mrms-hourly` is deployed and active (version 18) with `verify_jwt = true`.
- The live database contains an active `pg_cron` job named
  `mrms-hourly-ingestion`, scheduled at `20 * * * *`. This schedule was created
  outside the checked-in migration history.
- Recent cron rows report that the SQL/`pg_net` enqueue step succeeded, but recent
  `net._http_response` rows return HTTP `401`. The function is therefore actively
  scheduled but the current bearer credential is rejected before the handler runs.
- Dashboard function logs show no handler executions in the last five days, which
  is consistent with the gateway-level `401` responses.

**Former decision (superseded 2026-07-18):** retain the function and its JWT protection, but treat hourly ingestion
as broken until the scheduler credential is moved out of `rainfall_settings` and
replaced with a dedicated, fail-closed secret shared by the cron caller and function.
Do not set `verify_jwt = false` without adding explicit secret authentication in the
handler. The required live secret provisioning and cron replacement are an external
production change and must be performed as a dedicated hardening step.

### Production resolution

- `mrms-hourly` and `mrms-backfill` are now version-controlled under
  `supabase/functions/`; the previously dashboard-only backfill source is no longer
  configuration drift.
- Both functions use `@supabase/server` with `auth: 'secret:automations'`. Their
  `verify_jwt = false` setting is intentional: scheduled service calls send the
  named `sb_secret_*` credential in the `apikey` header, and each handler validates
  that exact named key before exposing the admin client.
- The key is stored in Vault as `mrms_automation_api_key`; the project URL is stored
  as `mrms_project_url`. Secret values are never committed.
- Migration `20260719022649_harden_mrms_scheduler_auth.sql` owns both schedules:
  `mrms-hourly-ingestion` at `20 * * * *` and `mrms-morning-backfill` at `5 7 * * *`.
  It fails closed if either Vault prerequisite is missing.
- The legacy `rainfall_settings.service_role_key` row was removed. Do not restore
  privileged API keys to application tables or send secret keys as bearer JWTs.
- Live verification: requests without a key and with an invalid key return `401`;
  a Vault-authenticated hourly request returned `200` and processed 38 fields.


## Automated Smoke Testing (Bot)

For end-to-end verification and UI smoke testing, use the following bot credentials:

**Bot Credentials:**
Credentials are in `.env.test.local` — see `.env.example` for required keys.

### Verification Checklist (v3.6.0+)
1. **Login**: Verify successful authentication with bot credentials.
2. **Fields**: Ensure "Test Plot A" is visible (or create it if the account is reset).
3. **Fertilizer Recipes**:
   - Open Fertilizer Modal.
   - Create a new recipe using the "Save as Recipe" toggle.
   - Verify the recipe appears in the "Use Recipe" dropdown.
   - Delete the recipe using the Trash icon.
   - Verify the confirmation dialog appears and the recipe is removed upon confirmation.
4. **Tillage Records**:
   - Create a tillage record.
   - Verify the "Activity Item" displays the field name alongside the implement type.
5. **Rainfall Resilience**:
   - Rapidly refresh field details.
   - Verify that `RainService` deduplicates calls (monitored via DevTools Network tab — only 2 RPCs per field per refresh).
6. **Wait-and-Verify**: Ensure that application saves are not blocked by recipe save failures.

## Architectural Standards
All tests must adhere to the "Wait-and-Verify" and "OpResult" patterns defined in the [BLUEPRINT.md](file:///c:/Projects/AcreLedger/BLUEPRINT.md).

## Authentication Email Delivery

- Production signup and password-reset testing requires a configured custom SMTP provider in Supabase Auth. The hosted default mailer is intentionally low-volume and is not suitable for repeated end-to-end account creation.
- Configure SMTP credentials and review email rate limits in the Supabase Dashboard before a multi-account test run. Never commit SMTP credentials to this repository.
- The client converts email throttling responses into a retry-later message; it must not report that account verification was sent when Supabase returned an error.
