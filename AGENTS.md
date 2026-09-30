# AGENTS.md — AcreLedger

## Purpose

This file is the cross-agent operating guide for AcreLedger. It is written for Claude Code, Codex, Gemini CLI, Pi/local agents, and any other AI coding assistant working in this repository.

Read this file first for working instructions and essential safety rules. Then use the
[feature-area index](#feature-area-index-read-only-what-the-task-touches) to open only the source
files and [BLUEPRINT.md](./BLUEPRINT.md) sections relevant to the task. BLUEPRINT owns detailed
architecture, design values, and examples; link to those details instead of copying them here.

> **Last updated:** 2026-09-29 (review-fix pass: Stripe period end, checkout gate, recovery-link PKCE-only, auth-expiry sync replay).
> **Verification scope:** This is not a whole-document code audit. Most sections have **not** been
> verified against code; only a section carrying a **Verified against code** note has been, and only
> for the scope that note states. Use `git log -- AGENTS.md` for edit history.
>
> **Where detail lives:** A rule stated here in summary form has its full, canonical version in the
> linked BLUEPRINT section. If the two disagree, fix the drift; until it is fixed, follow the stricter
> data-safety reading.

## Recent Changes

Keep the five most recent substantive entries, newest first; Git holds the full history.
Update **Last updated** when editing guidance. Update a section’s **Verified against code** note
only after checking that section’s implementation, recording the date, commit, and files inspected.
Navigation checks and editorial changes do not constitute verification of architectural claims.

- **2026-09-29** — Review-fix pass, rebased onto the 13-commit remote head (`e039a0d`). Billing: `current_period_end` is read from Stripe subscription items (basil API); checkout is refused for live `past_due`/`unpaid` subscriptions, skips the trial when the farm ever had a subscription, and reuses the Stripe customer. Recovery deep link accepts a PKCE `code` only. Sync replay refreshes an expired session once and pauses without spending retries. Verified on the merged tree: lint 0 errors/72 warnings, app and API typechecks, `verify:docs`, `verify:app-store`, `verify:migrations` (75-migration PGlite replay), `test:db-integrity`, 1,285 unit tests in 137 files, 31 owner-backup and 21 recovery tests, and the production bundle build.
- **2026-09-28** — Consistency pass: fixed the field-delete queueing contradiction (one batched `enqueueMutations`, never a per-record loop) and the optimistic-update step order (capture the snapshot before the optimistic setter); replaced duplicated feature detail with summaries that link to BLUEPRINT; AI model IDs now referenced by code constant; documented `verify:migrations`, `test:db-integrity`, and `install:owner-dr`.
- **2026-09-27** — Added the App Store submission sources, native purchase-boundary rules, screenshot evidence standard, and `verify:app-store` release gate; reconciled test-command guidance with `package.json` and the iOS runbook, verified against 5cc6503.
- **2026-09-21** — Aligned reading instructions, clarified verification scope, added generated contents and link checks, and moved detailed design guidance into BLUEPRINT. Earlier today: added freshness headers and the feature-area file index.
- **2026-09-20** — Native iOS SQLite encryption must stay explicitly on (`CapacitorSQLite.iosIsEncryption: true`); emergency sign-out documented for an unreadable offline store (592fef7).

## Contents

<!-- contents:start -->
- [Purpose](#purpose)
- [Recent Changes](#recent-changes)
- [Project Summary](#project-summary)
- [Context Loading Rules](#context-loading-rules)
- [Important Reference Files](#important-reference-files)
- [Non-Negotiable Rules](#non-negotiable-rules)
- [UI and Component Rules](#ui-and-component-rules)
- [Error Handling](#error-handling)
- [React and Performance Rules](#react-and-performance-rules)
- [Weather and Rainfall Rules](#weather-and-rainfall-rules)
- [Coding Style](#coding-style)
- [Change Workflow](#change-workflow)
- [When to Use `BLUEPRINT.md`](#when-to-use-blueprintmd)
- [Cross-Agent Consistency](#cross-agent-consistency)
<!-- contents:end -->

## Project Summary

AcreLedger is a mobile-first, PWA-ready agricultural record keeping and compliance reporting app for row-crop farmers and small operations. It tracks fields, planting, spraying, fertilizing, harvest, hay, grain bins, grain movement, weather, rainfall, and compliance exports.

The app uses React 18, TypeScript strict mode, Vite 7, React Router 7, Supabase Postgres/Auth/RLS, React Context state, shadcn/ui, Tailwind CSS, Lucide React, Sonner, Zod, Visual Crossing weather, IEM Stage IV rainfall integration, and **Capacitor 6 for native iOS wrapper and device capabilities**.

## Context Loading Rules

1. Read this file first.
2. Identify the task area before editing.
3. Read only the relevant source files and relevant sections of `BLUEPRINT.md`.
4. Use `TESTING.md` only when credentials, verification flows, or test protocols are needed.
5. Do not stuff the working context with unrelated architecture details.
6. Prefer focused source inspection over guessing.
7. Do not make broad refactors while solving a narrow issue.

## Important Reference Files

This list is a routing index, not required reading — identify the task area (see Context Loading
Rules), then open only the files for that area.

### Core (relevant to almost any task)

- [BLUEPRINT.md](./BLUEPRINT.md) — detailed architecture, data model, design values, and implementation patterns.
- [TESTING.md](./TESTING.md) — verification protocols and test credentials.
- [@/types/farm.ts](./src/types/farm.ts) — canonical TypeScript entity definitions.
- [@/lib/mappers.ts](./src/lib/mappers.ts) — entity to database row translation.
- [farmStore.tsx](./src/store/farmStore.tsx) — global React Context store and CRUD actions.
- [@/lib/syncQueue.ts](./src/lib/syncQueue.ts) — local sync queue and transaction retry engine for offline operation.
- [@/lib/backupSchema.ts](./src/lib/backupSchema.ts) — strict backup/restore validation schema.

### Feature-area index (read only what the task touches)

**Weather & rainfall**
- [api/weather-proxy.ts](./api/weather-proxy.ts) — authenticated Vercel Function that validates and rate-limits Visual Crossing requests while keeping the API key server-side.
- [src/test/weatherProxy.test.ts](./src/test/weatherProxy.test.ts) — weather-proxy contract tests; keep API tests outside [api/](./api) so Vercel does not deploy them as functions.
- [@/lib/fieldLocation.ts](./src/lib/fieldLocation.ts) — rainfall coordinate resolver that falls back from field coordinates to drawn boundaries, assigned CLU polygons, and legacy CLU numbers.

**AI assistant (Ask the Book)**
- [api/ai-assistant.ts](./api/ai-assistant.ts) + [server/ai-assistant-tools.ts](./server/ai-assistant-tools.ts) — read-only Ask the Book Vercel Function and its allowlisted named-tool read catalog. Rules: [AI Assistant / Ask the Book](#ai-assistant--ask-the-book).

**Reports & exports**
- [@/lib/complianceReports](./src/lib/complianceReports) — report generation.
- [@/lib/reportReadiness.ts](./src/lib/reportReadiness.ts) — shared report-readiness types, summary builder, and FSA/spray/fertilizer/hay/landlord readiness adapters.
- [@/lib/reportExportHistory.ts](./src/lib/reportExportHistory.ts) — per-user/farm/season/report local export fingerprints and changed-since-export status.
- [@/components/reports/MobileReportExportPanel.tsx](./src/components/reports/MobileReportExportPanel.tsx) + [ReportReadinessPanel.tsx](./src/components/reports/ReportReadinessPanel.tsx) + [ReportIssueList.tsx](./src/components/reports/ReportIssueList.tsx) — mobile export-first report workspace, readiness summary, and actionable grouped issues.
- [@/lib/complianceReports/fsa578PdfExport.ts](./src/lib/complianceReports/fsa578PdfExport.ts) — dedicated FSA employee-facing acreage worksheet PDF (cropland entry table, reconciliation totals, readiness review, and all-CLU reference appendix).
- [@/lib/complianceReports/generateLandlordSummary.ts](./src/lib/complianceReports/generateLandlordSummary.ts) — Landlord Summary data builder (field-level landlord grouping, activity timeline, grain yield, bale production, crop-share math, CSV export).
- [@/components/reports/LandlordSummaryReport.tsx](./src/components/reports/LandlordSummaryReport.tsx) — Landlord tab report UI (Fields overview + Activity Timeline, CSV/Detailed-PDF exports).
- [@/lib/sprayExport.ts](./src/lib/sprayExport.ts) — universal spray log PDF export, including spray attachment image rendering from encoded note tokens.

**FSA tracts & CLU**
- [@/types/fsaTract.ts](./src/types/fsaTract.ts) — canonical FSA tract import and CLU assignment types.
- [@/lib/cluImport.ts](./src/lib/cluImport.ts) — shared CLU/FSA GeoJSON and ESRI shapefile ZIP parsing, grouping, projection checks, and acreage validation.
- [@/lib/fsaOfficeRequestSheet.ts](./src/lib/fsaOfficeRequestSheet.ts) + [@/components/FsaRequestSheetDialog.tsx](./src/components/FsaRequestSheetDialog.tsx) — FSA boundary-file request worksheet data builder/PDF and its dialog.
- [@/lib/tractLookup.ts](./src/lib/tractLookup.ts) and [@/lib/bundledFsaTracts.ts](./src/lib/bundledFsaTracts.ts) — bundled/imported FSA tract lookup and merge helpers; use `loadKeyedTractCollections` when code needs tract keys preserved alongside GeoJSON collections.
- [@/store/useFsaTracts.ts](./src/store/useFsaTracts.ts) — FSA tract import and CLU assignment CRUD actions.
- [@/services/fsaTractService.ts](./src/services/fsaTractService.ts) and [@/services/cluAssignmentService.ts](./src/services/cluAssignmentService.ts) — Supabase persistence for FSA tract imports and CLU assignments.
- [@/components/TractAssignmentFlow.tsx](./src/components/TractAssignmentFlow.tsx), [@/components/CluAssignmentMap.tsx](./src/components/CluAssignmentMap.tsx), [@/components/CluFieldSelector.tsx](./src/components/CluFieldSelector.tsx), [@/components/FsaTractImporter.tsx](./src/components/FsaTractImporter.tsx) — FSA tract management UI.

**Activity records & shared UI**
- [@/utils/dates](./src/utils/dates.ts), [@/utils/numbers](./src/utils/numbers.ts), [@/utils/text](./src/utils/text.ts) — pure formatting helpers.
- [@/lib/utils.ts](./src/lib/utils.ts) — `cn` Tailwind class merge plus `getLatestForField` generic helper for finding the most recent non-deleted record for a field (used by activity modal suggested-record prefill).
- [@/lib/activityIcons.ts](./src/lib/activityIcons.ts) — centralized activity type icon and color maps (`ACTIVITY_ICONS`, `ACTIVITY_TEXT_COLORS`, `ACTIVITY_BG_COLORS`).
- [@/hooks/useSprayForm.ts](./src/hooks/useSprayForm.ts) — shared spray form state for the SprayWizard step components.
- [@/components/CustomSprayModal.tsx](./src/components/CustomSprayModal.tsx) + [@/components/SprayTypeChooser.tsx](./src/components/SprayTypeChooser.tsx) + [@/store/useCustomSprayRecords.ts](./src/store/useCustomSprayRecords.ts) — custom (outside-party) spray modal, the spray-entry chooser, and the CRUD hook (see Custom (Outside-Party) Spray Records).
- [@/components/SeasonSelect.tsx](./src/components/SeasonSelect.tsx) — centralized viewing-season dropdown (`variant="sidebar"` for the Sidebar); reads `activeSeason`/`viewingSeason`/`seasonOptions`/`setViewingSeason` from `useFarm()`. Do not re-declare inline season `Select`s — reuse this component.
- [@/hooks/useUndoDelete.ts](./src/hooks/useUndoDelete.ts) — undo-safe soft-delete pattern for FieldManager and similar bulk-delete UI.
- [@/hooks/useCoachmarks.ts](./src/hooks/useCoachmarks.ts) + [@/components/CoachmarkOverlay.tsx](./src/components/CoachmarkOverlay.tsx) — onboarding coachmark overlay system.
- [@/context/QuickAddContext.tsx](./src/context/QuickAddContext.tsx) — global Quick Add provider managing modal states, preselected types, and active fields.
- [@/components/QuickAddDialog.tsx](./src/components/QuickAddDialog.tsx) — global Quick Add dialog providing field selection and GPS-based nearest field detection.

**Offline, native & accounts**
- [@/lib/native.ts](./src/lib/native.ts) — centralized native capabilities (haptics, status bar, geolocation).
- [@/lib/offlineStorage.ts](./src/lib/offlineStorage.ts) — offline persistent key-value store.
- [@/hooks/useNetworkStatus.ts](./src/hooks/useNetworkStatus.ts) — network connectivity monitoring hook.
- [@/lib/secureStorage.ts](./src/lib/secureStorage.ts), [@/lib/authDeepLinks.ts](./src/lib/authDeepLinks.ts), and [@/lib/accountDeletion.ts](./src/lib/accountDeletion.ts) — native credential storage, password-recovery deep links, and the user-requested account-deletion intake path.

**Testing utilities**
- [@/test/supabaseMock.ts](./src/test/supabaseMock.ts) — shared thenable Supabase unit-test client for service/store tests; supports per-query table isolation, independent RPC controls, and reset-safe Vitest spies.
- [@/test/hookTestHarness.tsx](./src/test/hookTestHarness.tsx) — stateful hook-test array harness; use it when optimistic functional setters and rollback state must be asserted.

**Owner disaster recovery**
- [docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md](./docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md) — approved owner-only design implemented by [infrastructure/owner-backup/](./infrastructure/owner-backup), [scripts/recovery/](./scripts/recovery), and [docs/runbooks/](./docs/runbooks). Deployment and recovery capability remain unproven until the required live drills pass. This is distinct from the customer-facing JSON backup.
- [docs/runbooks/full-project-recovery.md](./docs/runbooks/full-project-recovery.md) and [docs/runbooks/single-farm-recovery.md](./docs/runbooks/single-farm-recovery.md) — owner operating procedures. Full-project SQL restore must use the checked-in `restore-isolated` command rather than a hand-written file sequence.

**Billing**
- [api/create-checkout-session.ts](./api/create-checkout-session.ts), [api/create-portal-session.ts](./api/create-portal-session.ts), [api/stripe-webhook.ts](./api/stripe-webhook.ts), [server/billing.ts](./server/billing.ts), and [@/lib/billing.ts](./src/lib/billing.ts) — Stripe test-mode-only billing surface, server gates, signed webhook mirror, and client entitlement rules.

**CI/CD**
- [codemagic.yaml](./codemagic.yaml) — CodeMagic CI/CD workflow for iOS builds and TestFlight distribution.
- [CODEMAGIC.md](./CODEMAGIC.md) — CodeMagic setup guide, credentials, and troubleshooting.
- [IOS_RELEASE.md](./IOS_RELEASE.md) — iOS release gates, device checks, submission notes, and dated validation evidence.
- [docs/app-store/2026-10-01-submission-package.md](./docs/app-store/2026-10-01-submission-package.md) — prepared App Store listing, review, privacy, age-rating, screenshot, and build-selection package.
- [docs/app-store/metadata.en-US.json](./docs/app-store/metadata.en-US.json) + [scripts/verify-app-store-metadata.mjs](./scripts/verify-app-store-metadata.mjs) — machine-readable English (U.S.) metadata and its length/URL/version gate.
- [ios/App/App/PrivacyInfo.xcprivacy](./ios/App/App/PrivacyInfo.xcprivacy) + [src/pages/Privacy.tsx](./src/pages/Privacy.tsx) — native privacy declarations and matching public policy; keep both aligned with App Store Connect answers and actual data use.

## Non-Negotiable Rules

### Data Safety

- Never hard-delete user farm records.
- Use soft delete by setting `deleted_at` to an ISO timestamp.
- Active records always have `deleted_at === null`.
- Client logic must exclude soft-deleted records.
- Supabase RLS must also exclude or protect soft-deleted records where applicable.

### Farm Scoping

- Every Supabase write must be scoped to the current `farm_id`.
- The null farm guard must be the first line of every mutation function:

```ts
if (!farm_id) {
  toast.error('No farm selected.');
  return false;
}
```

- Inserts and restore payloads must include the authoritative current `farm_id`.
- Updates must filter by `.eq('farm_id', farm_id)`.
- Do not send `farm_id` inside `.update()` payloads. Always filter by `.eq('farm_id', farm_id)` instead.

### Season Scoping

- Always stamp new records (both inside CRUD hooks and client components like `SprayModal.tsx`) with the user's currently selected `viewingSeason` (retrieved from `useFarm()`), not `activeSeason`.
- `activeSeason` represents the farm's currently active/current crop year. `viewingSeason` represents the season the user is currently viewing in the sidebar/UI.
- All record-creation and record-editing forms or modals must indicate their target season year in the title, and write actions must scope to `viewingSeason`.
- The local storage key `al_viewing_season` (with a user-scoped prefix) stores the current viewing season.
- On loading or syncing, `viewingSeason` must be validated and clamped to `[activeSeason - 10, min(activeSeason + 1, currentYear + 1)]`. Use the shared helpers in `@/lib/seasonYears.ts`; do not duplicate year-window arithmetic.
- Dropdown selectors (e.g. sidebar, activity, reports) must fetch dynamic options (`seasonOptions`) computed from `farmStore.tsx` rather than hardcoding options. The options must seed the allowed next season for pre-season planning, unless `activeSeason` is already `currentYear + 1`.
- `profiles.active_season` is synchronized across signed-in devices through a filtered Supabase Realtime subscription in `useAuth.ts`, with foreground/focus/online profile refresh as recovery for suspended sockets. If the device was viewing the previous active season, a remote rollover must advance `viewingSeason` to the new active season; a different historical selection is preserved when it remains valid and otherwise clamped.
- **Exception — grain bin inventory:** grain movements are still season-stamped on insert (`seasonYear: viewingSeason`), but bin *inventory* is continuous physical state and must be read season-independently via `getBinTotal(binId)` (no season arg → all-season total). Carryover grain vanishes and becomes unsellable if bin contents are scoped to the viewing season. Season-scoped views (history, reports) are fine; the Logistics bin monitor, SellModal inventory check, and DashboardStats bin totals must use the all-season total.

### Mapper Discipline

- Always call the relevant mapper before touching React state.
- Mappers must convert camelCase app objects to snake_case database rows.
- Optional fields must be sent as `null`, not `undefined`.
- Use mapper safety helpers such as `safeNum` and `safeStr` where appropriate.
- Mappers for user-managed reference data must preserve `id`, `farm_id`, and `deleted_at`.

### Optimistic Update Pattern

Full pattern and reference hooks: [BLUEPRINT → Optimistic Update Pattern](./BLUEPRINT.md#optimistic-update-pattern).

Every add, update, and delete mutation must follow this sequence:

1. Guard `farm_id` (first line) and return `false` if missing.
2. Validate inputs and return `false` on invalid data.
3. Call the mapper before any state change. If it throws, return `false` without touching state or the database.
4. Capture the rollback snapshot from the render closure (`previous = collection.find(item => item.id === id)`). Never capture it by mutating an outer variable inside a state updater. Reference: `useGrainMovements`, `useFieldsAndBins`.
5. Apply the optimistic update with a functional setter.
6. Await the Supabase operation inside `try...catch`, assigning a thrown exception to `error` so rollback still runs.
7. On success (`error` is null and the exact count matches), show success feedback and return `true`.
8. On error, restore the snapshot, show detailed error feedback, and return `false`.

All add, update, and delete operations return `Promise<boolean>` — `true` on success, `false` on failure. Never return `undefined`.

Offline and cascading mutations:

- Bulk or cascading offline mutations use one `syncQueue.enqueueMutations(...)` batch — **never** a per-record `enqueueMutation` loop.
- Field deletion: online uses the atomic `soft_delete_field_with_clu_assignments` RPC; offline puts the field's active `field_clu_assignments` before the field soft-delete in one batch.
- Sign-out fails closed unless the selected farm's pending queue is cleared. The emergency sign-out for an unreadable native store is not a successful clear, and account deletion stays blocked while the store is unreadable.
- Replay reconciliation compares ISO timestamps as instants (PostgreSQL `+00:00` equals queued `.000Z`) and all other values by exact recursive equality.
- Replay treats an expired session (HTTP 401, `PGRST301`/`PGRST303`, "JWT expired") as an auth problem, not a bad mutation: refresh once per drain, restart the queue, and if refresh fails pause without incrementing `retry_count`. Never count auth errors toward the permanent-failure retries.

### Supabase and Database

Canonical detail: [BLUEPRINT → Database Conventions](./BLUEPRINT.md#5-database-conventions).

- Do not use `upsert` for updates. Use `.update().eq('id', id).eq('farm_id', farm_id)`.
- **Do not use `.select()` in update or soft-delete mutations** to verify success. The `deleted_at IS NULL` SELECT policy hides a just-soft-deleted row from the returning clause, so the client sees 0 rows and falsely rolls back. Use `.update(payload, { count: 'exact' })` and check `count === 1` or `count === ids.length`.
- Sole exception to the upsert rule: inserts, offline replay, and backup restore for `fsa_tract_imports` (`farm_id,tract_key`) and `field_clu_assignments` (`farm_id,tract_key,clu_number`) must upsert on those conflict keys so soft-deleted rows are resurrected. Do not "fix" them into plain inserts. Details: [BLUEPRINT → FSA / CLU Upsert Exception](./BLUEPRINT.md#fsa--clu-upsert-exception).
- New migrations use unique 14-digit timestamp filenames: `YYYYMMDDHHMMSS_name.sql` (checked by `npm run verify:migrations`).
- New farm-owned tables follow the strict template in [BLUEPRINT → Data API Access](./BLUEPRINT.md#data-api-access-mandatory): RLS enabled, farm-scoped policies through `public.profiles`, `SELECT, INSERT, UPDATE` (no `DELETE`) for `authenticated`, no `anon` grant, `deleted_at IS NULL` in the SELECT policy, and the restrictive "no updates on deleted rows" policy.
- `profiles` is a security boundary: clients may update only `active_season` and `onboarding_complete`; farm membership is assigned only through `ensure_user_farm`. `active_season` stays within `[2000, currentYear + 1]`, including inside any `SECURITY DEFINER` RPC such as `restore_farm_backup`. Details: [BLUEPRINT → Profile Membership Protection](./BLUEPRINT.md#profile-membership-protection).
- Live profile-security tests assert PostgreSQL `42501` using non-mutating probes only (see [Testing](#testing)).
- Private quota state (weather proxy, Ask the Book) lives in non-exposed schemas behind `SECURITY DEFINER` wrappers that derive identity from `auth.uid()`, use an empty `search_path`, and deny `PUBLIC`/`anon`.
- Do not bypass RLS assumptions in client code.

### AI Assistant / Ask the Book

Canonical detail: [BLUEPRINT → Ask the Book Read Registry](./BLUEPRINT.md#ask-the-book-read-registry).

- The assistant is **read-only**: no add, edit, delete, restore, arbitrary RPC, or other mutation path.
- `server/ai-assistant-tools.ts` is the single allowlisted read registry. The model gets named tools only — never raw SQL, caller-chosen table names, a service-role/secret key, or a generic database client. Filters, aggregates, grouping, and search targets stay hardcoded and fail closed.
- Every read uses the caller's JWT with the publishable/anon key (RLS stays on) **and** applies the authoritative `farm_id` resolved from the caller's profile. Request input never selects a farm.
- Adding or renaming a user-facing farm table requires updating the registry and its catalog-isolation tests in the same change, or documenting why the table is excluded.
- `OPENROUTER_API_KEY` is server-only. Native builds require `VITE_AI_ASSISTANT_URL`, validated in `codemagic.yaml`.
- Model routing (primary, fallback, one retry, `AI_MODEL` override) is described in BLUEPRINT. The current model IDs are the `DEFAULT_PRIMARY_MODEL` and `FALLBACK_MODEL` constants in `api/ai-assistant.ts`; do not copy IDs into the docs.
- Voice uses on-device/OS speech through `src/lib/speech.ts` and `src/hooks/useAskVoice.ts`; only text reaches the server.
- **Intentional product decision:** no persistent AI disclaimer beneath answers. Do not reintroduce one unless the product owner reverses the decision (canonical statement in BLUEPRINT).
- Keep function tests outside `api/`. When the registry or endpoint changes, run the assistant unit tests, live RLS integration coverage when credentials exist, `npm run typecheck:api`, and a Vercel build.

### Grain Movement

Canonical detail: [BLUEPRINT → GrainMovement](./BLUEPRINT.md#grainmovement).

- `bushels` may be negative (estimate-vs-actual correction). Never clamp; display a warning, not a validation error.
- Bin inventory is season-independent (see Season Scoping). Validate sales against `getBinTotal(bin.id)`.
- Online and replayed updates/deletes carry the expected `grain_movements.version` captured from the render closure. Never use the activity `timestamp` as the concurrency token.
- A bin harvest and its incoming movement are one operation: create through `create_harvest_with_grain`, soft-delete through `soft_delete_harvests_with_grain`, queue offline as one envelope, and roll back both collections together.

### Spray Compliance

Canonical detail: [BLUEPRINT → SprayRecord](./BLUEPRINT.md#sprayrecord-2026-standards).

- Multiple products per application; tank-mix UI rows key on a temporary `ui_id`, never the array index.
- A missing `epaRegNumber`, or a missing, zero, negative, or unitless product rate, marks the record for compliance review. Derive this for legacy rows at read time; do not rewrite historical records to change the flag.
- Per-product totals are canonical and recalculated synchronously before save. `totalAmountApplied` is a legacy first-product value; never sum unlike units into it.
- Keep spray terminology state-neutral unless a specific legal report requires state wording.
- Import `WIND_ALERT_MPH` from `@/lib/weatherHelpers.ts`; do not re-declare it.
- Treated-area defaults and every report/export fallback go through `getEffectiveSprayTreatedAcres(record, field, cluAssignments)`, never a raw `field.acreage` read. An explicitly stored `treatedAreaSize` is always preserved.

### Activity Record Acreage Defaults

This rule applies to **every** activity modal that captures a per-record acreage/area value. Today that is spray (Treated Area Size above), **plant** (`PlantModal` `acreage`), and **fertilizer** (`FertilizerModal` `acres`). Harvest, hay, tillage, custom spray, and grain movement have no acreage field and are out of scope.

- The **new-record default** and every report/export fallback must use `getDisplayFieldAcres(field, cluAssignments)` — the FSA crop acreage — never a raw `field.acreage` read. `PlantModal` and `FertilizerModal` pull `cluAssignments` from `useFarm()` and compute `displayFieldAcres` for the default, mirroring `useSprayForm`.
- Each modal wraps its acreage setter in an **edited-ref** (`treatedAreaEditedRef` / `acreageEditedRef`) and runs a **CLU-hydration refresh effect** so the default self-corrects if CLU assignments load after the modal opens, while respecting manual edits and preserving stored values on edit/duplicate.
- An explicitly stored per-record acreage (e.g. a partial-field spot-spray or spot-application) is always preserved; only the default/fallback changes.
- Historical plant and fertilizer records were backfilled to FSA cropland acreage by migrations `20260715130000_backfill_plant_acreage_to_fsa_acreage.sql` and `20260715120000_backfill_fertilizer_acres_to_fsa_acreage.sql`, matching the spray backfill precedent. New activity types added later must follow the same pattern (default + backfill).


### Custom (Outside-Party) Spray Records

Canonical detail: [BLUEPRINT → CustomSprayRecord](./BLUEPRINT.md#customsprayrecord) and [Spray Entry Chooser](./BLUEPRINT.md#spray-entry-chooser-spraytypechoosertsx).

- Custom sprays are a lightweight log for outside applicators, not compliance `SprayRecord`s. They are excluded from the universal spray-log PDF and the non-compliant review queue.
- The Spray button opens `SprayTypeChooser`; keep both interception points (`FieldDetailScreen.tsx` and `QuickAddDialog.tsx`) in sync.
- `CustomSprayModal` never auto-fetches weather. **Pull historical weather** is explicit, and a failed lookup preserves manual values.
- CRUD follows the same farm-scope, season-stamp, soft-delete, optimistic-update, sync-queue, and backup/restore rules as the other activity hooks.
- `ActivityRecord` in `@/types/farm` is a **discriminated union** (`{ type: '<literal>'; data: <RecordType> }`), so mismatched pairs are a compile error. Feed consumers use `Exclude<ActivityRecord, { type: 'grain' }>`. Do not loosen it to `{ type: string; data: SomeUnion }`.

### FSA Tracts and CLU Assignments

Canonical detail: [BLUEPRINT → FsaTractImport](./BLUEPRINT.md#fsatractimport), [FieldCluAssignment](./BLUEPRINT.md#fieldcluassignment), [Field](./BLUEPRINT.md#field), [FSA-578 Acreage Reporting Worksheet](./BLUEPRINT.md#fsa-578-acreage-reporting-worksheet), and [Report Readiness](./BLUEPRINT.md#report-readiness-and-mobile-export-workspace).

Data and assignments:

- FSA tract imports and CLU assignments are farm-owned: farm scoping, mapper discipline (`mapFsaTractFromDb`/`mapFsaTractToDb`, `mapFieldCluAssignmentFromDb`/`mapFieldCluAssignmentToDb`), optimistic updates, and soft delete all apply. Never hard-delete assignments.
- Changes usually touch the whole stack together: `types/fsaTract.ts`, `mappers.ts`, `useFsaTracts.ts`, Supabase services, migrations/RLS, backup schema, bundled tract helpers, assignment UI, and FSA reports/tests.
- CLU parsing, map rendering, and centroids must support `Polygon` and `MultiPolygon`; use `@/lib/geoHelpers.ts`.
- `parseCluFile` is the only import entry point (GeoJSON and ESRI shapefile ZIP). Do not add a component-only parser or unzip path.
- Preserve the FSA office request sheet's accepted-format statement, farmers.gov/service-center guidance, operator/contact blanks, and "not an official USDA form" disclaimer.
- Soft-deleting a field also soft-deletes its active CLU assignments, through the batched offline queue or the online RPC described under [Optimistic Update Pattern](#optimistic-update-pattern) — never a per-record loop.
- Assignment toggles sync only the field's `cluNumbers` (`syncFieldAcreageAndClus`). Never overwrite boundary/manual acreage with a CLU total; `mapFieldToDb` omits `operational_acreage` when `boundaryAcreage` is unknown instead of writing zero.
- CLU totals and assigned/unassigned counts compare against the same CLU universe being displayed and exclude soft-deleted assignments. Imported-only counts are labeled imported-only unless the UI says it includes bundled tracts.
- Acreage is positive throughout the stack (backup schema, and `field_clu_assignments.acres > 0` in the database); field `acreage` may be `0` for an unmeasured new field. Never mutate source CLU feature acres.

Reports:

- FSA-578 and fall production worksheets are supporting worksheets, not official USDA forms. Preserve the disclaimer wording, include the farm name in header subtitles (preview and PDF), and keep CSV and PDF describing the same facts.
- The FSA-578 PDF uses `exportFsa578WorksheetPdf` (never the generic `exportToPdf`) with the canonical four-section order. Non-cropland CLUs never appear in the crop-entry table.
- Row-construction rules (multiple plantings per field/CLU, CLU-derived acreage, review rows, hay/pasture labeling, status display) live in BLUEPRINT; change them there and in `fsaReports.ts` together.
- Readiness findings are advisory and never disable export. Authoritative FSA validation stays in `validateFsa578Rows` / `validateFsaFallProductionRows`; `reportReadiness.ts` only adapts it.
- Reports are export-first on mobile (`MobileReportExportPanel` below `lg`). Do not reintroduce large previews as the default mobile experience.
- Plant FSA status fields (`Planted`, `Prevented Planting`, `Failed`, `Volunteer`, `Cover Crop`) change across types, mappers, backup schema, migrations, UI, reports, and tests together. Prevented planting may omit seed variety.

### Landlord Summary

Canonical detail: [BLUEPRINT → Landlord Summary Report](./BLUEPRINT.md#landlord-summary-report).

- Driven by field-level `Field.landlordName`, not the legacy `HarvestRecord.landlordName`. Only landlords with at least one non-deleted field are selectable.
- Acreage uses `getDisplayFieldAcres`; dates use `parseLocalDate` (see [Date Parsing and Sorting](#date-parsing-and-sorting)); every `ReportTable` cell carries `data-label`.
- Hay bales stay separate from bushels, with no inferred landlord bale share.
- Keep the retired `LandlordStatementReport` / `generateLandlordStatement` until its test coverage is migrated.
- Grain delivered-vs-owed is out of scope until grain movements gain a field/landlord link (a schema change).

### Backup and Restore

Canonical detail: [BLUEPRINT → Backup / Restore Farm Ownership](./BLUEPRINT.md#backup--restore-farm-ownership).

- The currently selected `farm_id` is authoritative: merge `{ ...record, farm_id }` (or `{ ...record, farmId: farm_id }` for FSA tract/CLU app types) before every mapper call.
- Backups include `backupVersion`, `fsaTracts`, and `cluAssignments`. Unversioned backups pass through `normalizeBackupForRestore` before strict validation. Settings and pre-rollover backups must pass `backupSchema` before download.
- Restore helpers write only JSON-present columns; never enumerate every column through `jsonb_populate_record(set)`.
- Never hydrate React state from raw backup arrays. If the restore RPC fails, do not mutate state.
- Season rollover requires a completed cloud load and an empty sync queue, advances exactly one year up to `currentYear + 1`, verifies exactly one profile row changed, and stops if its backup is not restorable. `profiles` must stay in the `supabase_realtime` publication.

### Owner Disaster Recovery (Implemented Tooling; Deployment/Drills Pending)

> **Status: not yet deployed.** Scheduling, Drive uploads, and both recovery drills are unproven. Do not describe this as operational.

Canonical detail: [BLUEPRINT → Owner Whole-Project Disaster Recovery](./BLUEPRINT.md#owner-whole-project-disaster-recovery-implemented-tooling-deploymentdrills-pending) and the plan in `docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md`.

- Owner-only, whole-project infrastructure: not a per-farm Drive connection and not a replacement for Settings → Backup Data. Never run dumps in the browser, the Capacitor app, a public Vercel endpoint, or a customer-accessible RPC.
- Archives keep everything, including soft-deleted rows, Auth, Storage bytes, and base64 spray images (the AI image-stripping boundary does not apply). Encrypt with the public key before upload; runtime secrets stay in Google Secret Manager.
- Never restore a whole archive into live production to recover one customer. Restore into an isolated project with `npm run restore-isolated --prefix scripts/recovery -- --plaintext-dir <verified-decrypted-directory>`; do not substitute a hand-written `psql` order.
- Single-farm recovery and Auth-user recreation must dry-run first, create a verified pre-recovery backup, stay scoped to one farm, and never hard-delete farm records.
- Every new or renamed farm-owned table updates `scripts/recovery/tenant-registry.ts` and its `information_schema` coverage test in the same change. Bump the manifest version when archive layout or recovery semantics change.

### Stripe Billing (Test Mode Only)

Canonical detail: [BLUEPRINT → Stripe Billing](./BLUEPRINT.md#stripe-billing-test-mode-web-only).

- Web-only, and hidden unless `VITE_BILLING_UI_ENABLED === 'true'` and the caller matches both the client and server allowlists (empty allowlists fail closed). Capacitor renders no billing surface.
- `BILLING_LIVE_CHARGES` stays absent or exactly `false`, and the server accepts only `sk_test_` keys, until the product owner approves the legal and production rollout.
- Enforcement is off by default: a missing or soft-deleted subscription row is `unmanaged` with full access. Do not let absent billing data become a paywall.
- Under the installed Stripe SDK (API `2025-08-27.basil`) `current_period_end` lives on subscription **items**, not the Subscription; use `resolveCurrentPeriodEnd` (`server/billing.ts`). Build webhook tests from the basil shape.
- Checkout is refused (409, use the portal) for a live `trialing`/`active`/`past_due`/`unpaid` subscription; only `canceled`/`incomplete` rows may start a new Checkout. The 122-day trial is granted only when the farm's row has never carried a Stripe subscription, and an existing `stripe_customer_id` is reused.
- `farm_subscriptions` is written only by the signed webhook (service role). Clients never trust query parameters or client-reported Stripe state.
- Billing tables stay out of the customer JSON backup and stay classified in the owner recovery registry.

### Account, Credential, and Password-Recovery Safety

Canonical detail: [BLUEPRINT → Account Lifecycle and Native Credential Safety](./BLUEPRINT.md#account-lifecycle-and-native-credential-safety).

- Account deletion is a request (`account_deletion_requests`), never a client-side delete. Never add client update/delete grants or let request input choose another user or farm.
- Native credentials and encryption material go through `secureStorage` (Keychain/Keystore).
- Keep the native recovery scheme `com.wsegbert.acreledger://auth/recovery`, the Supabase redirect allowlist, `Info.plist`, the app listener, and recovery tests synchronized. Never accept arbitrary custom-scheme hosts or paths, and never establish a session from raw `access_token`/`refresh_token` values in the URL: the native listener accepts only a PKCE `code` (`exchangeCodeForSession`).

### CI/CD (CodeMagic)

- `codemagic.yaml` defines the iOS build workflow for CodeMagic.
- The workflow triggers on push to `main` and builds an IPA for App Store distribution.
- Code signing uses uploaded certificates and provisioning profiles via `ios_signing`.
- TestFlight publishing uses `auth: integration` with the `appstore` integration.
- Environment variable group `appstore` contains `VITE_*` build secrets and ASC API credentials.
- Confirmed working TestFlight builds require `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_KEY_ID` in the `appstore` group.
- `VITE_RAIN_API_URL` is optional because `RainService` falls back to `https://rain-api.vercel.app` when the variable is missing. If configured, it must be a clean HTTPS URL; do not include quotes, `KEY=`, commas, CLI commands, or duplicate `/rain` path suffixes.
- `VITE_SUPABASE_URL` must be the raw HTTPS project URL, e.g. `https://<project-ref>.supabase.co`; do not include quotes, `KEY=`, commas, CLI commands, or the Postgres connection string in Codemagic values.
- Capacitor iOS builds depend on `npm run cap:build` using `vite build --mode capacitor`; keep `base: "./"` for capacitor mode so bundled JS/CSS load from `capacitor://localhost`.
- Native builds include `capacitor-secure-storage-plugin`; keep the lockfile, CocoaPods resolution, and iOS Keychain-backed credential migration aligned.
- Preserve the `com.wsegbert.acreledger` recovery URL scheme in `Info.plist` and the privacy manifest declarations in `ios/App/App/PrivacyInfo.xcprivacy`. Use `IOS_RELEASE.md` as the App Store/TestFlight release checklist.
- Keep iOS free of subscription prices, trial offers, sign-up/purchase calls to action, Stripe checkout, and external purchase links. Web pricing may remain on web, but Capacitor must show the sign-in-only product path guarded by `Capacitor.isNativePlatform()`; preserve the native coverage in `src/pages/__tests__/Landing.test.tsx` and `src/pages/__tests__/Settings.test.tsx`.
- App Store metadata is sourced from `docs/app-store/metadata.en-US.json` and the matching submission package. Run `npm run verify:app-store` after changing listing copy, URLs, or the marketing version. Keep the privacy manifest, public privacy page, App Store questionnaire answers, and review notes consistent with actual behavior.
- Final App Store screenshots must come from the exact selected release build using the approved fictional review account/dataset. Simulator or locally staged captures are draft evidence until their build provenance is tied to that release. Required captures must meet Apple's current device-family dimensions and contain no alpha channel. Never commit review-account credentials.
- Do not add a global `tar` override in `package.json`. Capacitor 6 CLI requires its compatible nested `tar@6` dependency shape; forcing `tar@7` breaks `npx cap sync ios` with `Cannot read properties of undefined (reading 'extract')`.
- Do not re-enable automatic external TestFlight submission unless App Store Connect Beta App Information and Beta App Review Information are complete.
- **Marketing version** is read from `package.json` at build time. **Build number** uses CodeMagic's `$BUILD_NUMBER`.
- **Do not** add `app_store_connect` publishing blocks without verifying the integration name exists in CodeMagic.
- The working integration name is `appstore`. Do not rename it without updating the yaml.
- Pushes that touch CI/CD must be synced across all three remotes (GitHub, Codeberg, GitLab) before they count as complete — see Git Remotes and Push Hygiene below.

### Git Remotes and Push Hygiene

- Remote topology: `origin` fetches from GitLab and carries **three push URLs** (GitLab, Codeberg, GitHub). A single `git push origin main` fans out to all three remotes at once — do not push each remote separately. The dedicated `github` and `codeberg` remotes exist for fetching and verifying individual hosts.
- Before pushing: `git fetch --all` and compare heads. `main` legitimately gains commits from other machines, GitHub PR merges (which land on GitHub first), and agent sessions. If a remote is ahead, fast-forward, or rebuild on the remote head and cherry-pick only the novel commits; never force-push `main`.
- After pushing: verify every remote head (`git ls-remote <remote> main` for each of `github`, `codeberg`, `origin`) reports the same hash. All three must match before the push is done — mandatory for CI/CD changes, because CodeMagic triggers on push to `main`.
- Codeberg intermittently rejects the fan-out push with `cannot lock ref 'refs/heads/main': is at <new> but expected <old>` **after** the update has already landed. The error text itself names the target hash, which proves success — read it, confirm with `ls-remote`, and never respond with a force-push. Observed with identical behavior on 2026-09-06 and 2026-09-08.

### Native & Offline Capability

- **Web Compatibility**: The codebase is a shared web/native hybrid. Never call Capacitor plugins unconditionally. All native device APIs must check `Capacitor.isNativePlatform()` or use `@/lib/native.ts` wrappers.
- **Offline Operations**: Mutations queue locally when offline (`@/lib/syncQueue.ts`, `@/lib/offlineStorage.ts`) and replay on reconnect or foreground resume; batching rules are under [Optimistic Update Pattern](#optimistic-update-pattern). Native iOS SQLite encryption must stay explicitly on (`CapacitorSQLite.iosIsEncryption: true` in `capacitor.config.ts` and the copied iOS config). The plugin treats a missing key as encryption off, which prevents opening the encrypted store.

- **Haptic Feedback**: Trigger native haptic feedback on major user interactions:
  - Navigation tab taps: light haptic feedback.
  - Record save/validation success: success notification haptic.
  - Form validation failure: error notification haptic.
- **Layout Insets**: Use CSS env safe-area variables for header and bottom navigation spacing to prevent content overlaps on notched screens (e.g. Dynamic Island).
- **PWA / Service Worker** (`src/main.tsx`): In `DEV`, service workers and caches are unregistered/cleared on load so code changes always win. In production, `registerSW` is wired so a waiting worker (`onNeedRefresh`) **and** a `controllerchange` flip both trigger an auto-reload — iOS checks for SW updates only ~daily on its own, so the app also polls `registration.update()` on `visibilitychange`, `focus`, `online`, and every 30 min while visible. Two safety guards must be preserved when touching this code:
  - The reload is deferred while a Radix overlay is open (`[data-state="open"]`, `[role="dialog"]`, `[role="alertdialog"]`) so unsaved form entries aren't lost; after `MAX_DEFERS` (10 × 30 s ≈ 5 min) it force-reloads so a stuck overlay can't pin the tab to a stale worker forever.
  - The `controllerchange` handler is guarded on `hadControllerAtLoad` so a first-ever visit (where the new worker claims a previously-uncontrolled page via `clients.claim()`) is **not** reloaded. Don't drop either guard — reloading on first load or mid-entry both wreck UX.

## UI and Component Rules

### Accessibility

- Every `DialogContent` must include a `DialogDescription`.
- Visually hidden descriptions are acceptable with `sr-only`.
- Every form input must have a unique `id` and `name`.
- Every `Label` must use `htmlFor` linked to the input ID.
- Interactive touch targets should be at least 44px high. Default form `Input` and `SelectTrigger` components must use `h-11` (44px) height. Custom height overrides (such as `h-9` or `h-10`) on form inputs and selectors should be avoided to prevent touch-target regressions.

### Light Mode Theme

Follow [BLUEPRINT → Light Mode Palette](./BLUEPRINT.md#light-mode-palette).

### Color Mode Theme

Follow [BLUEPRINT → Color Mode Palette](./BLUEPRINT.md#color-mode-palette).

### Typography

Follow [BLUEPRINT → Typography Split](./BLUEPRINT.md#typography-split).

### Numeric Display

- Do not render raw summed floating-point values for acreage, bushels, rainfall, percentages, or report totals.
- Use `roundTo` and `formatMeasurement` from `@/utils/numbers` for displayed measurements unless a more specific formatter already exists.
- Keep stored numeric precision intact; round for display/export summaries, not by mutating source records.
- Treat `0` as a valid display value. Use `value != null ? value : '—'`, not simple truthiness.

### Date Parsing and Sorting

- Never build `Date` objects from date-only strings with `new Date(iso)` or sort with `.getTime()` on raw fields; the UTC parse shifts date-only entries one day early in western timezones and produces `NaN` keys for invalid input.
- Display formatting uses `parseLocalDate` / `formatIsoDate` from `@/utils/dates`; epoch rendering uses `toLocalIsoDate`.
- Sorting or comparing records by the work date shown to the user must go through `getWorkDateMs` / `compareWorkDateDesc` from `@/utils/dates`, which parse date-only strings as local midnight and fall back to `record.timestamp`. The Landlord Summary section carries the same rule for its own paths; this is the general rule.

### Text Case

Follow [BLUEPRINT → Text Case & Tracking](./BLUEPRINT.md#text-case--tracking) and
[Field Card Status Pills](./BLUEPRINT.md#field-card-status-pills).

### Layout

- Preserve mobile-first design and clearance for fixed navigation and the Quick Add button.
- Follow [Bottom Padding & FAB Visibility](./BLUEPRINT.md#bottom-padding--fab-visibility) for the route allowlist and exact spacing; maintain those values in BLUEPRINT only.
- Follow [Page Header Pattern](./BLUEPRINT.md#page-header-pattern), [Border Radius Standard](./BLUEPRINT.md#border-radius-standard), and [Field Dashboard](./BLUEPRINT.md#field-dashboard-mobile-first) for presentation and section order.
- Keep dashboard crop filters, totals, and quick actions in the scrollable body below the WeatherBar; do not add floating or sticky bottom bars.
- Horizontal tab bars on mobile use horizontal scrolling and non-shrinking, non-wrapping labels so every tab remains reachable.

### Responsive Tables

- `ReportTable` applies the `mobile-cards` class globally. On screens ≤ 768px each table renders as a stack of bordered cards instead of a horizontally-scrollable grid.
- Reports-page tables are intentionally wrapped in `hidden lg:block print:block`; mobile users receive readiness, issue review, and export controls instead of the full table. `mobile-cards` remains the fallback for `ReportTable` consumers rendered on small screens elsewhere.
- Every data `<td>` inside a `ReportTable` MUST carry a `data-label="<HEADER>"` matching its column header. Cells without `data-label` render as unlabeled, right-aligned cards on mobile.
- Full-width rows (`<td colSpan={n}>` for banners, readiness checks, and empty states) MUST NOT carry `data-label`; they are handled automatically by the `td[colspan]` CSS rules and render full-width.
- Standalone `<table>`s that bypass `ReportTable` are excluded from the card layout by design. Do not add `mobile-cards` to them unless every cell also gets `data-label`. The Landlord Summary desktop/print preview (`LandlordSummaryReport.tsx`) uses `ReportTable` for both its Fields and Activity Timeline tables, so every cell there must carry `data-label`.

### Icons

- Lucide React is the only icon library.
- Never import a Lucide icon using a name that conflicts with a browser global object.
- Always alias risky icons:

```ts
import { Map as MapIcon, History as HistoryIcon } from 'lucide-react';
```

### Leaflet Maps

- Leaflet's internal panes default to z-index 200–1000, which sit above shadcn's `Dialog`/`Sheet`/`Popover` overlays (`z-50`). A global CSS override in `src/index.css` caps all Leaflet panes/controls at z-index 1–6 (preserving internal ordering) so modals render above maps. Do not raise these values without also bumping the shadcn overlay z-index, or maps will bleed through dialogs again.
- Internal map overlays (loading spinners, source badges, footer selectors) should use `z-10` to layer above the panes (1–6) but stay below the dialog overlay (50).
- Polygon and MultiPolygon coordinate extraction for Leaflet render layers and centroid calculations must go through `@/lib/geoHelpers.ts` (`getLatLngsFromGeometry`, `hasValidGeometry`, `getCentroid`).

## Error Handling

- Every page route is wrapped in `ErrorBoundary` (`src/components/ErrorBoundary.tsx`), a class component that catches render-time crashes and shows a retry UI.
- When adding new top-level routes, wrap the element in `<ErrorBoundary>`.
- Do not remove or bypass the error boundary; it prevents full-app blank-screen crashes.
- For non-fatal async errors (Supabase failures, weather/rainfall lookups), use `toast.error(...)` and degrade gracefully rather than throwing.

## React and Performance Rules

- Use `useFarm()` for global farm state.
- Wrap expensive derived values from large arrays in `useMemo`.
- Do not call `fields.find(...)` inside row-level `.map()` loops.
- Build lookup maps once with `useMemo`, for example `new Map()`.
- Pure helpers that do not depend on component state or props belong outside the component.
- Avoid manual chunks for UI libraries in Vite config unless there is a confirmed reason.
- `useEffect` dependency arrays must not depend on store entity object references (e.g. `field`, `plantRecords`) that `farmStore.tsx` recreates on every `fetchData()` call (app mount + each network reconnect). Depend only on primitives (e.g. `field.id`, `field.lat`, `field.lng`) or stable flags (e.g. `open`, `initialData`). Mismatched deps between sibling effects cause one effect to wipe async-fetched data (such as spray-log weather) while the effect that re-fetches it never re-runs, silently leaving the data missing. This caused the spray modal weather-not-loading bug; `HayModal` already follows the correct pattern.
- When an effect both initializes form state and an async fetch populates some of that state, the initialize/reset effect and the fetch effect must share the same stable trigger set (typically `open` and `initialData`), so a store refresh cannot clear already-fetched data without re-triggering the fetch.

## Weather and Rainfall Rules

- Weather uses Visual Crossing, routed through `WeatherService.buildWeatherUrl`. In dev (or Capacitor builds with `VITE_VISUALCROSSING_KEY` set and no proxy), it calls the Visual Crossing API directly; otherwise it goes through the `/api/weather-proxy` Vercel Function. Production proxy requests require a Supabase bearer token, validated server-side with `auth.getUser(token)`. `WeatherService` resolves the proxy base via `resolveWeatherProxyUrl()`.
- `VITE_WEATHER_PROXY_URL` (optional) overrides the proxy base for Capacitor builds. If set, it must be HTTPS (or `localhost`/`127.0.0.1`), have no surrounding quotes, and not already include the `/api/weather-proxy` path suffix — `WeatherService` appends it. A Capacitor build with neither `VITE_VISUALCROSSING_KEY` nor `VITE_WEATHER_PROXY_URL` throws at URL-build time rather than failing silently. `WeatherService.cleanEnvValue` strips stray quotes/whitespace from these env vars at load.
- The proxy's server-only variables, exact-origin CORS allowlist, method and endpoint allowlists, timeout, and per-user quota (`429` with `Retry-After` on exhaustion, `503` fail-closed on RPC failure) are specified in [BLUEPRINT → Weather Proxy](./BLUEPRINT.md#weather-proxy-apiweather-proxyts). Never use a wildcard origin. Apply the rate-limit migration before deploying proxy code, and redeploy after any Vercel variable change.
- Rainfall uses the Rain API with IEM Stage IV radar plus Supabase RPC merge.
- Rainfall lookups should use coordinates when available so the radar merge remains active.
- Lat/lng should be rounded to 4 decimals for radar grid consistency.
- Polygon field boundaries should fall back to centroids when explicit coordinates are missing.
- Field rainfall lookups should go through `resolveFieldRainfallLocation` from `@/lib/fieldLocation.ts` so fields without explicit lat/lng can use drawn boundary centroids, assigned CLU geometry, or legacy CLU numbers before showing missing-location errors.
- When resolving CLU geometry for rainfall or maps, preserve tract keys with `loadKeyedTractCollections` rather than losing key context from raw `TractFeatureCollection[]` arrays.
- Weather and rainfall request failures should degrade gracefully without crashing the UI.
- Windy radar embeds require CSP entries in both `child-src` and `frame-src`.

## Coding Style

- TypeScript strict mode is expected.
- Prefer explicit types for exported functions and public helpers.
- Keep logic local and boring unless a shared helper already exists.
- Do not introduce new libraries without a strong reason.
- Reuse existing shadcn/ui, Tailwind, Lucide, Sonner, Zod, mapper, and utility patterns.
- Use existing naming conventions rather than inventing new ones.

### File Naming

- **Components**: PascalCase — e.g. `FieldCard.tsx`, `SprayModal.tsx`.
- **Pages**: PascalCase — e.g. `Index.tsx`, `Settings.tsx`, `FieldDetailScreen.tsx`.
- **Hooks**: camelCase with `use` prefix — e.g. `usePlantRecords.ts`, `useAuth.ts`.
- **Services and utilities**: camelCase — e.g. `binService.ts`, `sprayExport.ts`, `dates.ts`.
- **Type definitions**: camelCase — e.g. `farm.ts`, `database.ts`, `weather.ts`.
- **shadcn/ui primitives**: kebab-case in `src/components/ui/` — e.g. `alert-dialog.tsx`, `input-otp.tsx`.
- **Tests**: colocated, appended `.test` — e.g. `mappers.test.ts`, `WeatherService.test.ts`.

### Spray Wizard Pattern

`SprayModal` is refactored into a 5-file wizard pattern:
- `src/components/spray/SprayWizardNav.tsx` — step progress bar and Prev/Next/Save buttons.
- `src/components/spray/SprayWizardCoreStep.tsx` — field, date, applicator, equipment, site info.
- `src/components/spray/SprayWizardMixStep.tsx` — tank mix, products, rates, recipe loading.
- `src/components/spray/SprayWizardConditionsStep.tsx` — weather, wind, conditions.
- `src/components/spray/SprayWizardReviewStep.tsx` — summary and save.
- `src/hooks/useSprayForm.ts` — shared form state (products, weather, conditions, review data) consumed by all step components.

Keep each step component under ~150 lines. All form state lives in `useSprayForm`; step components are pure presenters. `SprayModal` owns only the step routing, navigation callbacks, and save dispatch.

Spray also has an in-cab quick mode controlled by `useSprayForm.isQuickMode`; preserve both the quick path and full wizard path when changing validation, save behavior, or field prefills. Quick mode is optimized for glove-friendly spray logging and still writes through the same `handleSubmit` path.

Spray photo/ticket attachments are stored in `notes` as `[ATTACHMENT:data:image/...;base64,...]` tokens. UI and exports must parse/strip this token and render the image separately; never display or export raw base64 attachment text. `sprayExport.ts` is responsible for embedding the attachment image in PDF exports.

After a successful new spray with a novel mix, `useSprayForm` may prompt to save the mix as a spray recipe. Keep that recipe dialog mounted until the user confirms or cancels, even if the spray record itself has already saved. Recipe duplicate checks should compare product name, rate, rate unit, and EPA registration number, not product names alone.

### Activity Record Modals

All activity record modals (`PlantModal`, `SprayModal`, `HarvestModal`, `HayModal`, `FertilizerModal`, `TillageModal`, `GrainMovementModal`, and the lightweight `CustomSprayModal`) share a common prop and behavior pattern. `CustomSprayModal` is reached via `SprayTypeChooser` (not a top-level activity button) and its records render inside the Spray tab through `CustomSprayTab`.

- **`mode?: 'edit' | 'duplicate'`** — defaults to `'edit'`. Pass `'duplicate'` to open the modal pre-filled from an existing record but creating a new record on save instead of updating the source.
- **`isDuplicate = mode === 'duplicate' && !!initialData`** — every modal computes this locally. Duplicate mode without `initialData` falls through to "new" behavior.
- **Duplicate semantics**: stamp today's date (not the source record's date), stamp `viewingSeason` as `seasonYear` (not the source's season), and call `addXxxRecord` (not `updateXxxRecord`) on save.
- **`onDuplicate?` callback** is plumbed through `RecordListItem` → activity tabs (`PlantTab`, `SprayTab`, `HarvestTab`, `HayTab`, `FertilizerTab`, `TillageTab`, `GrainTab`) and `HistoryFeed` → `Activity.tsx` / `FieldDetailScreen.tsx`. Tabs that don't pass `onDuplicate` simply hide the duplicate button.

**Suggested-record prefill**: when opening a modal without `initialData` (new record), each modal pre-fills non-date fields from the most recent prior record of the same type for that field — e.g., spray pre-fills applicator name, license number, target pest, and tank-mix products from the last spray on the field; plant pre-fills crop and seed variety; hay pre-fills bale type; etc. Use `getLatestForField` from `@/lib/utils` to compute the source record. Duplicate mode bypasses the prefill (it uses `initialData`).

**`editingRecordType` discriminator**: `Activity.tsx` and `FieldDetailScreen.tsx` track the clicked record's type in a separate `editingRecordType` state and gate modal rendering on it (`editingRecordType === 'plant' && ...`), NOT on the visible tab. This lets users click edit/duplicate on any record from the All/History tab and still get the correct modal — gating on `tab` would fail when the user is on the All tab. Modal `onClose` handlers must reset all three states together: `setEditingRecord(null); setEditingRecordType(null); setEditingMode('edit')`.

**Spray review queue**: `Activity.tsx` includes a review-queue filter for incomplete/non-compliant spray records (`nonCompliant === true`). Keep the queue scoped to `viewingSeason`, the current search filter, and pending-delete filtering so it matches the records the user can act on.

### Undo-Delete Pattern

Field deletion uses an undo-safe pattern via `src/hooks/useUndoDelete.ts`. Instead of a blocking AlertDialog confirmation, the record is hidden immediately with a toast undo affordance. The mutation commits only after the undo window expires:

```ts
const { pending, requestDelete } = useUndoDelete<T>({
  onCommit: async (ids) => { /* actual deleteField() calls */ },
  onError: () => toast.error('Failed to delete field.'),
});

// Call site:
requestDelete([fieldId], `Field "${field.name}" deleted`, field.name);
```

`pending` is a `Set<T>` of IDs pending deletion. Filter it out of render arrays: `fields.filter(f => !f.deleted_at && !pending.has(f.id))`. Never call the delete API directly from a UI click handler when using this hook.

### Activity Icons

Icon and color mapping for activity types is centralized in `src/lib/activityIcons.ts`:
- `ACTIVITY_ICONS` — Lucide icon per `ActivityType`.
- `ACTIVITY_TEXT_COLORS` — Tailwind text color class per type.
- `ACTIVITY_BG_COLORS` — Tailwind background color class per type.

Replace inline icon/color switch logic in `RecordListItem`, `FieldCard`, `DashboardStats`, and similar components with these maps. `ActivityType` covers: `plant`, `spray`, `customSpray`, `harvest`, `grain`, `hay`, `fertilizer`, `tillage`.

### Coachmarks (Onboarding Overlay)

Onboarding coachmarks use `src/hooks/useCoachmarks` and render via `src/components/CoachmarkOverlay`. Steps target DOM elements by `id` on those elements. Target IDs on key UI elements:
- Dashboard tab: `id="coachmark-activity-tab"`, `id="coachmark-reports-tab"`.

The hook is enabled only when `session && onboardingComplete && location.pathname === '/'`. New coachmark steps targeting other elements must add stable `id` attributes to those elements first.

### Testing

- The test suite is split into **unit** and **integration**. `npm run test:unit` runs the app unit suite, which excludes `**/*.integration.test.{ts,tsx}`. `npm run test` runs documentation, tracked-asset, and App Store metadata verification before that suite plus owner disaster-recovery package tests (`test:owner-dr`). CodeMagic's Unit tests step and GitLab's `test_job` both run `npm run test`, so those workflows must `npm ci` `infrastructure/owner-backup` and `scripts/recovery` after the root install (`npm run install:owner-dr` does both) — a root-only `npm ci` leaves those packages without vitest and fails the step. GitLab must use Node 22 to match the owner-backup engine range. `npm run test:integration` runs the integration suite via `vitest.integration.config.ts` — those tests hit live services and require credentials/network (`RainService.integration.test.ts` for the real Rain API, `auth.integration.test.ts` for bot auth). Integration tests skip cleanly when their env/credentials are absent (`describe.skipIf` / early-return on `import.meta.env`). Do not add live-network tests to the unit suite; name them `*.integration.test.*`.
- `npm run test:coverage` collects V8 coverage over the production-surface scope defined in the `coverage` block of `vite.config.ts` (tests, generated data, type declarations, shadcn/ui primitives, and entry-point boilerplate are excluded). The baseline is recorded in `TESTING.md`; no thresholds are enforced yet.
- Keep Vercel Function unit tests in `src/test/weatherProxy.test.ts` and `src/test/aiAssistant.test.ts`, never under `api/`; Vercel treats TypeScript files under `api/` as deployable functions. Run `npm run typecheck:api` whenever the weather proxy or AI assistant function changes.
- Authentication integration tests must keep forbidden profile-write probes non-mutating and assert the exact `42501` authorization code. Positive profile-update checks should use same-value writes unless the test explicitly owns and restores the changed value.
- For Supabase-backed unit tests, reuse `createSupabaseMock()` from `src/test/supabaseMock.ts`. Create one mock per suite, register it with `vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }))`, dynamically import the system under test in `beforeAll`, and call `mock.reset()` in `beforeEach`. Do not put the imported factory inside `vi.hoisted(...)` and do not replace this lifecycle with per-test imports unless `vi.resetModules()` is also intentional.
- The shared Supabase mock returns a distinct thenable builder from every `from(table)` call. Preserve that per-query table capture: hooks such as `useFsaTracts` issue different table queries through `Promise.all`, and a global `lastTable` makes concurrent results cross-contaminate. Use `setTableHandler` when concurrent tables need different results; use the independent `setRpcResult`/`setRpcThrow` controls for RPCs. Add new chain methods only when production code under test actually uses them.
- Hook rollback tests must use `useStatefulArray` from `src/test/hookTestHarness.tsx`; a plain `vi.fn()` setter does not execute functional React state updates and cannot prove optimistic state or rollback behavior.
- `fieldService`, `binService`, `fsaTractService`, and `cluAssignmentService` have query-contract suites under `src/services/__tests__/`. The field/bin services intentionally return raw Supabase results; success/count interpretation and optimistic rollback remain hook responsibilities. Preserve exact `id` and `farm_id` filter assertions in service tests, and preserve the sanctioned FSA/CLU upsert conflict keys.
- Component testing involving complex map lifecycles (like `MapContainer` or Leaflet) should mock the nested map components (`CluAssignmentMap`, `CluFieldSelector`, etc.) and invoke their callbacks explicitly.
- Use explicit `await waitFor(...)` assertions when interacting with mocked component state that relies on React's asynchronous render cycle to avoid stale prop values during test execution.
- When mocking `useFarm` in modal tests, include every collection the modal reads (`plantRecords`, `sprayRecords`, `harvestRecords`, `hayHarvestRecords`, `customSprayRecords`, `fertilizerApplications`, `tillageRecords`, `fields`, `cluAssignments`, etc.). Activity modals compute suggested-record prefills via `.filter()` on these arrays, so an `undefined` collection crashes the `useMemo` on mount — see `SprayModal.test.tsx` for the canonical mock shape.

### Import Order

Group imports in this order, separated by blank lines:

1. React and React addons (e.g. `react`, `react-router-dom`).
2. External libraries (e.g. `@supabase/supabase-js`, `sonner`, `lucide-react`, `framer-motion`).
3. Internal `@/` imports — components, store, types, services, utils.
4. Relative imports (`../lib/`, `./`).

Within each group, order alphabetically by module path. This matches the existing codebase and keeps diffs clean.

## Change Workflow

Before editing:

1. State the likely files involved.
2. Inspect existing implementations and adjacent patterns.
3. Check relevant data types and mappers.
4. Check whether the change touches RLS, migrations, reports, exports, or backup/restore.

While editing:

1. Keep changes minimal and task-scoped.
2. Preserve existing behavior unless the task explicitly asks to change it.
3. Update types, mappers, database logic, UI, and reports together when the data model changes. For any new field/table, also update `backupSchema.ts` when it belongs in the customer farm backup (the `.strict()` schemas reject unknown keys, so a missing entry throws on every save), add a Supabase migration, extend `generateTestData.ts`, and classify the table in `scripts/recovery/tenant-registry.ts` under the owner-recovery design described in `docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md`.
4. Do not leave TODOs in production code unless the user explicitly asks for scaffolding.

After editing:

1. Run the most relevant available checks. The repo defines:
   - `npm run verify:docs` — verifies generated contents and local Markdown links in AGENTS and BLUEPRINT. After changing headings, run `npm run docs:toc` and review the generated diff. External URLs and inline code paths outside the linked file index are not checked.
   - `npm run verify:app-store` — validates App Store metadata field limits, HTTPS URLs, and the marketing version. Run for App Store copy/URL/version changes; it is also part of `npm test`.
   - `npm run lint` — `eslint .` (fast, run for any source change; the gate is **zero errors** — warnings are tracked, not blocked).
   - `npm run typecheck` — `tsc -b` (the **authoritative type gate** via project references in `tsconfig.json`). This is the real type check; `vite build` uses SWC and does **not** typecheck, so it cannot substitute for `typecheck`. Run this for any source/type change.
   - `npm run typecheck:api` — checks the Vercel Function TypeScript project. Run whenever `api/weather-proxy.ts`, `api/ai-assistant.ts`, `server/ai-assistant-tools.ts`, or their imports change.
   - `npm run test` — documentation and tracked-asset checks, then app unit and owner-DR package tests. Run `npm run test:unit` for the app suite alone. See [Testing](#testing).
   - `npm run build` — `vite build` (the **bundle gate**, not the type gate).
   - `npm run verify:migrations` — checks migration filename format, unique timestamps, and disabled seed configuration, then replays every migration in order against a disposable in-memory PostgreSQL (PGlite) with the Supabase platform bootstrap, failing if any migration alters a relation that no migration creates. Run after adding or renaming a migration. It is not part of `npm test`; the GitLab `database` job runs it together with `test:db-integrity`. As of 2026-09-29 it passes: `supabase/migrations/20260316090000_core_harvest_grain_baseline.sql` reconstructs the core schema so the full history replays.
   - `npm run test:db-integrity` — runs the tenant-scoped harvest/grain foreign-key migration and the harvest/grain baseline checks against in-memory PGlite. Run when changing those migrations or harvest/grain linkage.
2. Summarize changed files, behavior changes, and verification results, including which of the above commands you ran and their outcome.
3. Mention any unchecked risk clearly.

## When to Use `BLUEPRINT.md`

Use targeted sections of [BLUEPRINT.md](./BLUEPRINT.md) when working on:

- Data models or farm entity behavior.
- Supabase writes, RLS, migrations, or restore flows.
- UI design system or accessibility patterns.
- Spray compliance, weather, rainfall, FSA reports, or grain movement.
- Any bug involving optimistic updates, local state, or mapper output.

Do not read the full blueprint for small isolated edits such as text copy, minor styling, or a local bug fix unless the code path is unclear.

## Cross-Agent Consistency

- `AGENTS.md` is the canonical shared instruction file.
- Agent-specific instruction files (`CLAUDE.md`, `GEMINI.md`, `CODEX.md`) may add model-specific notes but must always point back to `AGENTS.md` and never contradict it.
- If instructions conflict, follow the more specific project safety rule first, especially data safety, farm scoping, RLS, mapper discipline, and soft delete rules.
