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

The Phase 1 service suites are:

- `cluAssignmentService.test.ts` — update/remove scoping plus the sanctioned CLU conflict-key upsert.
- `fsaTractService.test.ts` — import/fetch/delete RPC and the sanctioned tract conflict-key upsert.
- `fieldAndBinServices.test.ts` — table-driven create, update, and soft-delete query contracts with exact record and farm filters.
- `supabaseMock.test.ts` — thenable, rejection, RPC independence, reset, and concurrent table-isolation contracts.

## Coverage Baseline

Updated 2026-07-19 after the Phase 1 service suites via `npm run test:coverage` (V8 provider). Scope is production
sources only — see the `coverage` block in `vite.config.ts`. No thresholds are set
yet (Phase 0 records the baseline; a conservative global floor is added after the
hook/service tests land).

| Metric      | Covered | Total | %     |
|-------------|---------|-------|-------|
| Statements  | 7,475   | 23,831| 31.36 |
| Branches    | 1,563   | 2,280 | 68.55 |
| Functions   | 302     | 544   | 55.51 |
| Lines       | 7,475   | 23,831| 31.36 |

Observations driving the test roadmap:
- `src/store/**` is the lowest-covered area by design (mutation hooks untested).
- `fieldService`, `binService`, `fsaTractService`, and `cluAssignmentService` now have 100% statement/branch/function/line coverage; the services aggregate is 85.97% statements.
- Strong areas: pure lib (`mappers`, `fieldAcreage`, `geoHelpers`, `crypto`), `utils/`, `RainService`.
- Current verified unit checkpoint: 53 files and 494 tests passing. Treat the count as a snapshot, not a fixed assertion; the command exit status is the gate.

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
