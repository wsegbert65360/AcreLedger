---
name: acreledger-code-review
description: "Review AcreLedger changes since a fixed point (commit, branch, tag, PR). Runs the repo's own checks, then reviews Standards, Spec, Data safety/sync, Database/RLS, Entitlements, Deploy/ops and Mobile UX in parallel sub-agents, and writes a severity-ranked review doc. Use for 'review since X', a branch, a PR, or uncommitted work. Review only: never change repo files."
---

Review the diff between `HEAD` (plus uncommitted work) and a fixed point. **Review only. Change no repo files, discard nothing, never touch production data or run DDL/writes against a live database.**

AcreLedger: React 18 + TypeScript strict + Vite + Capacitor PWA, offline-first, Supabase (Postgres/Auth/RLS) multi-tenant by `farm_id`, Free/Pro tiers, Stripe (test mode), MRMS rainfall edge functions, Vercel deploy. `AGENTS.md` is the canonical rulebook (`CLAUDE.md`, `CODEX.md`, `GEMINI.md` point to it). There is no separate `agent.md`.

## 1. Pin the range
- Fixed point = what the user gave (SHA, branch, tag, `main`, `HEAD~N`, PR number). If none, ask.
- `git rev-parse <ref>`; `git diff <ref>...HEAD --stat` must be non-empty. An empty diff with uncommitted work is fine; say so. Also `git status` and `git log <ref>..HEAD --oneline`. Uncommitted work is in scope; list it separately.
- Context loading (from AGENTS.md): read `AGENTS.md`; find the touched areas in its routing index; read the matching `docs/agents/<topic>.md` and the source files it names; read only the relevant `BLUEPRINT.md` sections. Always read `docs/agents/data-safety.md` and `docs/agents/coding-style.md`. Read `docs/*-discovery.md` for the feature (cattle, free-tier).
- If the Projects tool exists, read the newest `claude/code-review-*.md` and carry forward its open items.

## 2. Run checks (Node 22 per `.nvmrc`; Node 18 is not the gate)
Read `package.json` scripts first; run only scripts that exist. List the rest under **Not run** with the reason.
- Gate: `npm run ci:vercel-gate` (lint, `test:unit:gate`, typecheck, typecheck:api, test:db-integrity, verify:no-secret-in-bundle). If it can't run, run the pieces.
- Always: `npm run lint` (ESLint + farm-write guards), `npm run typecheck` (`tsc -b`; `vite build` does not typecheck), `npm run test:unit`.
- When `api/` or `server/` changed: `npm run typecheck:api`.
- When migrations or SQL changed: `npm run verify:migrations`, `npm run test:db-integrity` (disposable PGlite; it never contacts a live DB).
- When docs headings changed: `npm run docs:toc` then `npm run verify:docs`. When listing copy, URLs or version changed: `npm run verify:app-store`.
- Before release: `npm run build`, `npm run verify:no-secret-in-bundle`, `npm run test:owner-dr` (backup/recovery code).
- Run in a clean clone or worktree of HEAD when the working copy is dirty, so uncommitted work can't hide a failure. A failure that also fails on clean HEAD is pre-existing: say so.

## 3. Find the spec
In order: issue/plan references in commit messages; a path the user gave; `docs/plans/`, `docs/*-discovery.md`, `docs/decisions.md`; plan docs in the Project (`claude/*plan*.md`). Owner decisions in earlier review docs count as spec. If none, ask. If the user says there is none, skip the Spec axis and say so.

## 4. Review axes
Run as parallel sub-agents with fresh context. Give each the diff command, commit list, the standards files you found, and its checklist. Read-only.

**A. Standards.** AGENTS.md "Non-negotiable data-safety rules" and `docs/agents/*.md` first; a documented rule beats the baseline smells. Also use the existing lenses in `.code-review/lenses/` (code-quality incl. adversarial inputs: null/NaN/empty/duplicate/out-of-order, claim-vs-code audit; maintainability; accessibility; product-vision). Baseline smells as judgement calls only: Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man, Refused Bequest. Skip what lint/tsc enforces. Flag helpers nothing calls except tests. A narrow fix should not carry a broad refactor.

**B. Spec.** Requirements missing or partial; behaviour not asked for (scope creep); implemented but wrong. Quote the spec line for each. Copy marked DRAFT or not yet owner-approved goes on the owner-decision list.

**C. Data safety and sync.** A farmer's records must never be lost or silently stale.
- Soft delete only: `deleted_at` ISO timestamp; active rows `deleted_at === null`; no `.delete()` or stray `.upsert()` on farm tables (lint enforces; check allowlist comments `farm-write-allowlist: upsert` are justified).
- No `.select()` after `.update()`; use `.update(payload, { count: 'exact' })` and require the exact count. A zero-row update is never success.
- Every write scoped to `farm_id`: null-farm guard is the first line and returns `false`; inserts carry `farm_id`; updates filter `.eq('farm_id', farm_id)` and don't send `farm_id` in the payload.
- New records use `viewingSeason` (not `activeSeason`) and helpers in `src/lib/seasonYears.ts`. Bin inventory is the exception: `getBinTotal(binId)` with no season.
- Mapper before state; optional fields `null` not `undefined`; user-managed reference mappers keep `id`, `farm_id`, `deleted_at`; mappers send `deleted_at` explicitly (value or null) or restore can't resurrect rows.
- CRUD returns `Promise<boolean>` with the optimistic sequence and a rollback snapshot from the render closure; rollbacks touch only the changed ids.
- Offline queue (`src/lib/syncQueue.ts`): new RPC keys registered; dependent writes ordered (insert before RPC); retry vs park rules; parked items never vanish from the UI; a queued change wins over a stale server value; fail-soft fetches so one failing table or column never blocks the whole load.
- A new farm table or field also updates `src/lib/backupSchema.ts` (if customer-backup data), adds a migration, extends `generateTestData.ts`, and is classified in `scripts/recovery/tenant-registry.ts`; account deletion covers it; restore survives name reuse/collisions without aborting the whole farm restore.
- localStorage/IndexedDB access guarded with try/catch. Client rounding matches DB precision (replay must compare equal); blank vs NULL normalised before compare.
- Failed deletes and refusals show a message, never silent.
- Exports: native uses Filesystem + Share (Blob download does nothing in WKWebView); CSV uses the formula-injection sanitizer.
- Ask the Book is owner-only, not marketed, not removed; AI tools stay off tables they must not read, with a test saying so.

**D. Database, RLS and migrations.**
- New public `farm_id` table in a migration after `20261110190000`: RLS enabled, no DELETE grant to anon/authenticated/PUBLIC, no anon grant, client SELECT policy requires `deleted_at IS NULL` (`verify:migrations` checks). Also require the "no updates on deleted rows" policy; that guard does NOT check it.
- Tenant policies by `farm_id`; no client write path to service-role tables.
- `SECURITY DEFINER` functions: `set search_path = ''`, check `auth.uid()` membership and `farm_id`, explicit `REVOKE ... FROM public, anon` then `GRANT` to `authenticated` only where intended; idempotent by id; the Pro check sits after the already-applied return so replays are never refused. Do not replace the equipment meter RPCs.
- A committed migration is never edited; fixes are new migrations with later timestamps ordered after the newest in `supabase/migrations`. Renamed or edited-after-apply files mean history drift.
- Prod must have the schema before the build that needs it ships (a recurring High). Verify read-only through the Supabase connector on the production project (`list_migrations`, `information_schema`, `get_advisors`). If unavailable, mark "verify first".
- UTC vs local date checks (Australia is ahead of UTC); unique-index and conflict behaviour on retry.
- Profile and membership writes stay on the allowed column list (profile boundary in AGENTS.md/BLUEPRINT).

**E. Entitlements and billing** (`docs/agents/billing.md`).
- Free vs Pro enforced on the server (`assert_premium`, RPC guards); the client's Pro feature list matches the server allowlist (a test should tie them).
- Gated UI has a real Pro note; plan copy lives in `src/copy/entitlements.ts` and says "Pro".
- iOS stays free of prices, trials, Stripe checkout and in-app purchase. The US storefront link (`src/lib/storefront.ts`, `src/hooks/useIosUpgradeLink.ts`, `PlanUpgradeLink`) must not change; keep `Landing.test.tsx` and `Settings.test.tsx`.
- Stripe webhook, idempotency and test-mode gates still fail closed; production `ENTITLEMENTS_MODE` is `enforce` (since 2026-11-16); flag any change that would turn it off or assumes it is off.
- Free-tier caps (fields, rainfall slots) can't be bypassed by offline replay.
- Feature flags default off and the app behaves exactly as before with the flag off (`runs_cattle`: groups and moves free; events, transfers, CSV Pro).

**F. Deploy and ops** (`docs/agents/ci-release.md`).
- The GitHub repo is public: scan the diff for keys, tokens, `.env*`, service-role keys, stray root files (`*.diff`, `*.patch`, `query.sql`, prompt files). `VITE_VISUALCROSSING_KEY` must not be in the `appstore` group or `dist/assets`; no review-account credentials committed.
- Vercel builds from GitLab, not GitHub. A GitHub PR merge lands on GitHub only; the change isn't shipped until `origin` (three push URLs: GitLab, Codeberg, GitHub) is pushed and `git ls-remote <remote> main` matches on `github`, `codeberg`, `origin`. Never force-push `main`. A Codeberg "cannot lock ref ... expected" error after the update landed is not a failure: confirm with `ls-remote`.
- Schema changes ship in order: migrations to prod, then the app deploy. Flag any build that could ship first.
- Edge functions: auth on scheduled calls, pagination past 1,000 rows, bounded backfills. New endpoints check auth and quotas. `docs/ACCOUNT_DELETION_RUNBOOK.md` covers new data.
- Docs: AGENTS.md/BLUEPRINT/topic file updated in the same change; the "Verified against code" header stays true.

**G. Mobile UX and accessibility** (`docs/agents/ui.md`).
- 44pt minimum tap targets; works at the smallest supported iPhone width; no hover-only actions.
- Offline: clear message and disabled actions, never a silent failure.
- Overlays/dialogs: focus, Escape, screen-reader labels; `fixed` elements use viewport coordinates; lazy (Suspense) targets handled.
- Copy matches real behaviour (no promise the free plan can't keep); AU pilot users get paddock wording and the AU path, US behaviour unchanged.
- Native: Capacitor config, `com.wsegbert.acreledger` recovery URL scheme, keychain storage, privacy manifest, App Store screenshot/label impacts.

## 5. Tests
For each finding name the test that would have caught it. New tests must fail on old code and pass on new. Note missing coverage for new RPCs, mappers, restore, sync queue and gating.

## 6. Output
Save one doc to the Acreledger Project as `claude/code-review-YYYY-MM-DD-<topic>.md` with `project_write`; if there is no Projects tool, give the full text in chat. House format:
1. Title, then range, mode (review only), what was and wasn't read.
2. **Checks run** table (command, result) and **Not run**.
3. **Verdict**: 3-5 sentences, what blocks release.
4. **Findings**: one severity-ranked table `# | Sev | Axis | File:line | Problem | Suggested fix`. Mark "verify first" where prod state decides severity and "unverified" where only read, not run.
5. **Status of prior findings** (open/fixed/partly) when earlier reviews exist.
6. **What's solid** (short).
7. **Tests to add**, **Owner decisions needed**, **Suggested fix order**.
When merging a second AI's review, re-verify its items against the code, mark them, and say which option you chose and why.

Be terse. Evidence over opinion. Never apply fixes; wait for the user.
