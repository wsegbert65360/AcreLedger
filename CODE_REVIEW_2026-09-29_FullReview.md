# Code Review — Full Review (2026-09-29)

**Scope:** server/API surface, billing, offline sync, auth, database migrations, edge functions, repo hygiene.
**Mode:** review only. No files in the repo were changed.

## Coverage — read this first

This is a risk-focused pass, not a line-by-line read of every file. **Read closely:** `api/*`, `server/billing.ts`, `src/lib/{billing,syncQueue,offlineStorage,secureStorage,supabase,authDeepLinks}.ts`, `src/utils/crypto.ts`, `src/store/{useAuth,farmStore,useSeasonManagement}`, `AccountManager.tsx`, 13 recent migrations, the MRMS edge functions, CI/config.
**Not read:** most UI components, the per-record store hooks, `mappers.ts`, report generators, `server/ai-assistant-tools.ts` (55 KB), and the tests.
**Not run:** `npm test`, `typecheck`, `lint` (no shell on your machine in this session). Run them before acting on anything below.
The 2026-09-12 bug sweep's fixes (CLU import guard, date parsing, rollback index) were not re-verified; `Landing.tsx` is present again, so that earlier typecheck blocker appears resolved.

## What's solid

- Stripe webhook: raw-body signature check, idempotency ledger with retry-on-failure, stale-subscription rejection, 500-on-DB-error so Stripe retries. Test-mode gate fails closed on all three billing endpoints.
- Data API hardening is real: profile writes column-limited, `farm_subscriptions` read-only to clients, anon grants revoked, server quotas via SECURITY DEFINER RPCs with `search_path = ''`.
- Sync queue: serialized web writes, transactional native batch, zero-row reconciliation, linked harvest+grain RPC, no hard deletes.
- No secrets are tracked in git (`.env*` only `.env.example` in the index; scanned `recent_changes.diff` for key patterns — none).

## Findings

| # | Sev | Area | Finding |
|---|-----|------|---------|
| 1 | **High** (latent) | Billing | `current_period_end` is never populated under the installed Stripe SDK |
| 2 | **High** | Sync | Expired JWT after a long offline stretch is treated as a *permanent* failure |
| 3 | Medium | Sync/UI | Permanently failing mutations vanish from the UI and can't be cleared |
| 4 | Medium | Billing | Re-checkout allows double subscriptions and repeat 122-day trials |
| 5 | Medium | Auth | Native recovery deep link accepts raw `access_token`/`refresh_token` |
| 6 | Medium | Auth | `refreshSession()` loop if `farm_id` is never in the JWT (needs verification) |
| 7 | Medium | Edge fn | `mrms-hourly` reads all `fields` unpaginated and includes soft-deleted rows |
| 8 | Medium | AI/privacy | Default model is a `:free` OpenRouter model, farm data leaves the system |
| 9 | Medium | Perf | Web sync queue re-encrypts the whole queue (2× PBKDF2) on every mutation |
| 10 | Medium | Process | No core-schema baseline migration; `database` CI job is red by design |
| 11 | Low | Sync | Queue ordering ties on `created_at` (native) |
| 12 | Low | Security | Web "encryption" key sits next to the ciphertext |
| 13 | Low | Billing | Account deletion doesn't cancel the Stripe subscription |
| 14 | Low | AI | Quota burned on upstream failure; purge `DELETE` runs on every request; UTC day boundary |
| 15 | Low | Hygiene | Stray files tracked at repo root; env cleaning inconsistent; placeholder Supabase fallback |

### 1. `current_period_end` is always null — High (latent, inert until enforcement)
`server/billing.ts:218` reads `subscription.current_period_end`. Installed `stripe@18.5.0` pins API `2025-08-27.basil`, where that field was **removed from Subscription and moved to `items.data[].current_period_end`** (confirmed: `types/Subscriptions.d.ts` has no such field; `types/SubscriptionItems.d.ts:53` does). The optional field in `StripeSubscriptionLike` lets it typecheck, and the tests use hand-built objects with the old shape, so they pass.
**Effect once `enforce` is on:** `canceled`/`unpaid` farms lose access immediately instead of at period end; `past_due` falls back to `trial_ends_at` (null after the trial) and locks instantly. Fails closed, so it's not a leak, but paying customers would be locked out.
**Fix:** read `subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end`; update the type and tests to the basil shape; add a test built from a real Stripe fixture.

### 2. Expired token = "permanent" sync failure — High
`isTransientMutationError` (`syncQueue.ts:88`) only pauses for network-ish errors. A farmer offline all day comes back with an expired access token; PostgREST returns 401 / `PGRST301` / "JWT expired". That falls into the permanent branch: `retry_count` climbs, the "still cannot sync" toast fires at 3, and the drain keeps going, failing every item.
**Fix:** treat status 401 and `PGRST30x` as transient-with-refresh: call `supabase.auth.refreshSession()` once, retry the item, and pause the drain if it still fails. Don't increment `retry_count` for auth errors.

### 3. Stuck mutations disappear from the UI and block sign-out/deletion — Medium
`replayQueueOnce` returns `true` even when items were skipped (`pendingRetryCount > 0`), and `farmStore.tsx:563` then runs `fetchData()`, which replaces state with the server snapshot. A record whose insert permanently failed disappears from view while staying in the queue. There's no dead-letter state, no retry cap, and no UI to inspect, export, or discard it. `pendingSyncCount` never reaches 0, so the account-deletion flow ("Sync your offline changes first") is permanently blocked and sign-out always warns.
**Fix:** cap retries, move exhausted items to a `failed` state, surface them in Settings → Sync with "retry / export / discard", exclude `failed` from the deletion gate, and return a tri-state from `replayQueue` so `fetchData` doesn't erase pending local rows silently.

### 4. Checkout gate allows double subscriptions and repeat trials — Medium
`canStartCheckout` only blocks `trialing`/`active`. A `past_due`/`unpaid`/`incomplete` farm whose Stripe subscription is still live can start a second Checkout; the webhook then replaces the mirror row (`allowReplacement`) and the old subscription keeps billing. Separately, every Checkout sets `trial_period_days: 122`, so cancel → re-subscribe gives another free 4 months. The idempotency key also ignores `origin`/`email`, so a changed value with the same key returns a Stripe idempotency error (surfaced as a 502).
**Fix:** for an existing row with a `stripe_customer_id`, reuse `customer` instead of `customer_email`; only grant the trial if the farm has never had a subscription; route `past_due`/`unpaid` to the portal; include origin in the idempotency key.

### 5. Recovery deep link accepts raw tokens — Medium
`authDeepLinks.ts:34-47` accepts `access_token`/`refresh_token` from any `com.wsegbert.acreledger://auth/recovery#…` URL and calls `setSession`. Custom URL schemes aren't exclusive on iOS, so any app or page that opens that URL can sign the user into an attacker's session (login CSRF). The client uses `flowType: 'pkce'`, where the `code` path is bound to a locally stored verifier, so the token fallback is unnecessary.
**Fix:** remove the token branch (keep `code` only). Longer term, use Universal Links.

### 6. Possible `refreshSession()` loop — Medium (verify first)
`useAuth.ts:134`: if `profile.farm_id !== app_metadata.farm_id` it calls `refreshSession()`, which emits a new session object, which re-triggers the effect (`[session]`). Nothing in the repo's migrations sets `app_metadata.farm_id`, so this only terminates if the (out-of-repo) baseline `ensure_user_farm`/`handle_new_user` sets it. **Check:** decode a live JWT and look for `app_metadata.farm_id`. If absent, you're refreshing on every session change. **Fix:** guard with a ref (once per user/farm), or drop the JWT sync since RLS reads `profiles`. The `user_metadata` fallback is user-editable; harmless for UI state, but don't let it drive authorization.

### 7. `mrms-hourly` reads every field, unpaginated — Medium
`supabase/functions/mrms-hourly/index.ts` does `.from('fields').select('id, lat, lng')` with the admin client: no `deleted_at IS NULL`, no pagination. PostgREST's default 1,000-row cap silently truncates once the SaaS has >1,000 fields across all farms, and soft-deleted fields keep receiving rainfall rows. Null `lat`/`lng` handling isn't visible. **Fix:** add `.is('deleted_at', null)`, use the repo's `fetchAllPages` pattern, skip null coordinates. Also confirm memory headroom for decoding the 3500×7000 grid.

### 8. AI assistant sends farm data to a `:free` model — Medium
`api/ai-assistant.ts` defaults to `minimax/minimax-m3:free`, falling back to `openrouter/free`, with `data_collection: 'deny'`. Free routes commonly log/train, and with `deny` they may simply be unavailable, so the assistant is either leaking or flaky. Turns (question + answer) are also retained 30 days. **Fix:** pick a paid model with zero-data-retention, make `AI_MODEL` required in production, and make sure the Privacy page states the OpenRouter processing and 30-day retention.

### 9. Web queue re-encrypts everything per mutation — Medium
Every enqueue, dequeue and retry bump does: decrypt whole queue → mutate → encrypt whole queue, and `generateKey` runs PBKDF2 (100k iterations) on *each* call (`crypto.ts:62`). Replaying N items is O(N²) bytes and ~2N slow KDF runs on a phone-class browser. **Fix:** cache the derived `CryptoKey` (derive once from the secret), and batch dequeues during replay.

### 10. No baseline schema; CI is intentionally red — Medium (process)
`migrations/` starts at 2026-03-17 and assumes tables, `handle_new_user`, `ensure_user_farm`, and core RLS already exist. `.gitlab-ci.yml`'s `database` job is designed to fail until a baseline exists. You can't rebuild a staging or recovery database from the repo. **Fix:** capture a `pg_dump --schema-only` baseline as migration zero and make `verify:migrations` green.

### Low
- **11.** Native `ORDER BY created_at ASC` ties for batch enqueues (identical `now`); add `, rowid ASC`.
- **12.** On web the "encryption" key lives in the same origin storage as the ciphertext; it's obfuscation, not protection. Say so in docs; don't rely on it.
- **13.** `account_deletion_requests` is only a row; nothing cancels the Stripe subscription. Add that to the deletion runbook before live charges.
- **14.** AI quota is consumed before the upstream call (failures still cost a question); `purge_old_turns()` runs a `DELETE` on every request (rely on the cron); the daily window is UTC, so it resets at ~7 pm Central.
- **15.** Tracked root clutter: `recent_changes.diff` (390 KB), `recent_changes_utf8.diff`, `query.sql`, `migrations20250313_rainfall_weather_fixes.sql` (looks like a mis-named file). API handlers use `process.env` raw while billing uses `cleanEnvValue`. `supabase.ts` silently falls back to a placeholder URL in a production build instead of failing loudly.

## Remediation plan

| Phase | When | Work | Findings | Exit check |
|-------|------|------|----------|------------|
| **0 — Verify** | Today | Run `npm test`, `typecheck`, `lint`. Decode a live JWT for `app_metadata.farm_id`. Check `git ls-files` for stray root files. | 6, 15 | Baseline green/red list recorded |
| **1 — Before any paying user** | This week | Fix `current_period_end` + real-fixture test. Tighten checkout gate (customer reuse, one trial, past_due→portal). Remove the token deep-link branch. | 1, 4, 5 | New tests fail on old code, pass on new |
| **2 — Offline reliability** | Next | Auth-aware replay (refresh on 401). Retry cap + `failed` state + Settings UI. Cache the PBKDF2 key; batch dequeues. Tri-state `replayQueue`. Tie-break ordering. | 2, 3, 9, 11 | Sync tests for expired-JWT and stuck-item; sign-out/deletion no longer blocked by dead items |
| **3 — Data correctness at scale** | Before 1,000 fields | Paginate + filter `mrms-hourly`. Guard or remove the `refreshSession` loop. | 6, 7 | Edge fn test with >1,000 fields |
| **4 — Privacy & ops** | Before launch | Paid ZDR AI model + Privacy page update. Baseline schema migration; make CI green. Stripe cancel step in deletion runbook. | 8, 10, 13, 14 | `verify:migrations` passes in CI |
| **5 — Hygiene** | Anytime | Delete/ignore stray root files; unify env cleaning; fail loudly on missing Supabase env in prod builds. | 12, 15 | Clean `git status` |

**Suggested order if you only do three things:** #1 (billing period end), #2 (expired-token sync), #4 (checkout gate).
