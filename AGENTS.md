# AGENTS.md — AcreLedger

## Purpose

This file is the cross-agent operating guide. It holds the summary, the context-loading rules, the non-negotiable data-safety rules, the change workflow, and the routing index.

Read this file first. Then open only the topic file in the [routing index](#routing-index) and the [BLUEPRINT.md](./BLUEPRINT.md) sections the task touches. Feature rules live under `docs/agents/`, one rule in one file. BLUEPRINT holds architecture detail.

> **Last updated:** 2026-11-16 (Free tier enforced in production; FSA/CLU entry free; Fall FSA and Hay Summary Pro).
> **Verification scope:** This is not a whole-document code audit. A topic file's **Verified against code** note lists what was checked and the commit. Use `git log -- AGENTS.md` for edit history.
>
> **Where detail lives:** The topic file is the agent rule. [BLUEPRINT.md](./BLUEPRINT.md) is the architecture write-up. If they disagree, follow the stricter data-safety reading and fix the drift.

## Recent Changes

Keep the five most recent substantive entries, newest first. Git holds the full history. Reasons are in [docs/decisions.md](./docs/decisions.md).

- **2026-11-16** — Free tier enforcement is ON in production (`entitlement_config.mode = 'enforce'`, device limit off); the owner farm is complimentary. FSA/CLU data entry is free (`20261116120000_fsa_entry_free.sql`); Fall FSA and Hay Summary joined the Pro prepared reports. Onboarding: AU-pilot users must pick a region; completion needs exactly one profile row; completed users leave `/onboarding`. The tour blocks spotlight clicks and makes the app inert. Roll back enforcement with `update public.entitlement_config set mode = 'off', updated_at = now() where singleton = true;`. See [docs/agents/billing.md](./docs/agents/billing.md).
- **2026-11-15** — Cattle is optional and off unless `farms.runs_cattle` is on. Groups, pasture moves, and head-count edits are free. Events, head transfers, and the cattle CSV export are Pro. See [docs/agents/cattle.md](./docs/agents/cattle.md).
- **2026-11-14** — Harvest scale ticket is shown only for town loads, and a blank ticket is never a fall-worksheet warning.
- **2026-11-13** — Year-end reports: one landlord row per field per crop, US Letter PDFs with shared AcreLedger branding (the note intentionally carries the "Start your own at acreledger.app" line by product decision, with no price or trial wording), spray log names missing details, and new tank-mix products default to `fl oz/ac`. Shipped as 3.6.3.
- **2026-11-13** — Review fixes: a free farm at the field cap can undo a pre-season reset; a rainfall slot with cleared coordinates reads empty; a legacy `trialing` row shows as Free.

## Contents

<!-- contents:start -->
- [Purpose](#purpose)
- [Recent Changes](#recent-changes)
- [Project Summary](#project-summary)
- [Context Loading Rules](#context-loading-rules)
- [Non-negotiable data-safety rules](#non-negotiable-data-safety-rules)
- [Change workflow](#change-workflow)
- [When to use `BLUEPRINT.md`](#when-to-use-blueprintmd)
- [Cross-agent consistency](#cross-agent-consistency)
- [Routing index](#routing-index)
<!-- contents:end -->

## Project Summary

AcreLedger is a mobile-first, PWA-ready agricultural record book for individual farmers and small operations. It tracks fields, planting, spraying, fertilizing, harvest, hay, grain bins, grain movement, weather, rainfall, and compliance exports. The customer tiers are Free and Pro. Pro is $299 per farm per year. The one-page product description is [PRODUCT.md](./PRODUCT.md). Agent rules for billing are in [docs/agents/billing.md](./docs/agents/billing.md).

The app uses React 18, TypeScript strict mode, Vite 7, React Router 7, Supabase Postgres/Auth/RLS, React Context, shadcn/ui, Tailwind CSS, Lucide, Sonner, Zod, Visual Crossing weather, IEM Stage IV rainfall, and Capacitor 8.

## Context Loading Rules

1. Read this file first.
2. Identify the task area in the routing index.
3. Read that topic file and the source it names.
4. Read only the relevant BLUEPRINT sections.
5. Use [TESTING.md](./TESTING.md) only when credentials or a verification protocol are needed.
6. Do not load unrelated architecture into the working context.
7. Prefer reading the source over guessing.
8. Do not make a broad refactor while solving a narrow issue.
9. Before removing a rule, check the code. If the code still depends on it, keep the rule.

## Non-negotiable data-safety rules

The full text is [docs/agents/data-safety.md](./docs/agents/data-safety.md). These are the rules that must not be skipped. Where a check exists, it is named.

- Soft-delete farm records by setting `deleted_at` to an ISO timestamp. Active records have `deleted_at === null`. Client code and RLS exclude soft-deleted rows. Check: `npm run lint` runs `scripts/check-farm-writes.mjs`, which rejects `.delete()` on farm-owned tables in `src/` and `supabase/functions/`.
- `.upsert()` is rejected in those same trees except `fsa_tract_imports` and `field_clu_assignments`. The sync-queue replay and the rainfall upserts in `mrms-backfill`, `mrms-daily`, and `mrms-hourly` carry `farm-write-allowlist: upsert`. Same check.
- `.select()` chained after `.update()` is rejected in those trees. Use `.update(payload, { count: 'exact' })` and require the exact count. Same check.
- A new public `farm_id` table in a migration after `20261110190000` must enable RLS, must not grant DELETE to anon, authenticated, or PUBLIC, must not grant anon, and its client SELECT policy must require `deleted_at IS NULL`. Check: `npm run verify:migrations` (`scripts/farm-table-migration-guard.mjs`). Also keep the "no updates on deleted rows" policy. That guard does not check it.
- Every Supabase write is scoped to the current `farm_id`. The null-farm guard is the first line of a mutation and returns `false`. Inserts carry `farm_id`. Updates filter with `.eq('farm_id', farm_id)` and do not send `farm_id` in the payload. No automated check.
- New records use `viewingSeason`, not `activeSeason`, and the season window helpers in `src/lib/seasonYears.ts`. Bin inventory is the exception: `getBinTotal(binId)` with no season is the all-season total. No automated check.
- Call the mapper before changing React state. Optional fields are `null`, not `undefined`. No automated check.
- Add, update, and delete return `Promise<boolean>` and follow the optimistic sequence in the topic file, including a rollback snapshot taken from the render closure. No automated check.

## Change workflow

Before editing, name the files, read the adjacent code, check types and mappers, and check whether the change touches RLS, migrations, reports, exports, or backup.

While editing, keep the diff small and preserve behavior unless the task asks for a change. When the data model changes, update types, mappers, database logic, UI, and reports together. A new farm field or table also updates `src/lib/backupSchema.ts` when it belongs in the customer backup, adds a migration, extends `generateTestData.ts`, and is classified in `scripts/recovery/tenant-registry.ts`. Do not leave TODOs in production code unless asked.

After editing, run the checks the change touches and report which ones ran:

- `npm run verify:docs` — contents blocks and local Markdown links in AGENTS, BLUEPRINT, and `docs/agents/`. After a heading change, run `npm run docs:toc`.
- `npm run verify:app-store` — App Store metadata limits, HTTPS URLs, and the marketing version.
- `npm run lint` — ESLint, then the farm-write and farm-table migration tests and `scripts/check-farm-writes.mjs`. The gate is zero errors.
- `npm run typecheck` — `tsc -b`, the type gate. `vite build` does not typecheck.
- `npm run typecheck:api` — the Vercel Function project, when `api/` or `server/` code changes.
- `npm run test:unit` — the app unit suite. `npm run test` also runs docs, tracked-asset, and App Store checks, then owner-DR package tests.
- `npm run test:unit:gate` — the CI unit gate.
- `npm run build` — the bundle gate, not the type gate.
- `npm run verify:migrations` — migration filenames and a disposable PGlite replay, including the new farm-table guard.
- `npm run test:db-integrity` — disposable PGlite suites. It does not contact a live database.

Say what changed, what you ran, and any risk you did not check. `.nvmrc` is Node 22. Use that for unit tests and typecheck. Node 18 is not the gate.

## When to use `BLUEPRINT.md`

Open a BLUEPRINT section for a data model, an RLS or restore rule, the design system, or the long form of a pattern a topic file points at. Do not read the whole blueprint for a copy change or a local bug when the code path is clear.

## Cross-agent consistency

`AGENTS.md` is the canonical entry. `CLAUDE.md`, `GEMINI.md`, and `CODEX.md` may add model notes and must point back here. If two instructions conflict, follow the stricter data-safety rule: soft delete, farm scope, RLS, and mapper discipline.

## Routing index

Core files for almost any task:

- [BLUEPRINT.md](./BLUEPRINT.md) — architecture and design values.
- [TESTING.md](./TESTING.md) — verification protocols and credentials.
- [src/types/farm.ts](./src/types/farm.ts) — entity types.
- [src/lib/mappers.ts](./src/lib/mappers.ts) — camelCase to database rows.
- [src/store/farmStore.tsx](./src/store/farmStore.tsx) — farm context and CRUD.
- [src/lib/syncQueue.ts](./src/lib/syncQueue.ts) — offline queue.
- [src/lib/backupSchema.ts](./src/lib/backupSchema.ts) — backup validation.

Topic file, then the code it names:

- Data safety — [docs/agents/data-safety.md](./docs/agents/data-safety.md)
- Backup and restore — [docs/agents/backup.md](./docs/agents/backup.md)
- Ask the Book (owner's farm only; not marketed; do not remove) — [docs/agents/ask-the-book.md](./docs/agents/ask-the-book.md)
- Spray, compliance, Australia pilot — [docs/agents/spray.md](./docs/agents/spray.md)
- Activity records — [docs/agents/activity.md](./docs/agents/activity.md)
- Grain — [docs/agents/grain.md](./docs/agents/grain.md)
- FSA tracts, CLU, acreage worksheets — [docs/agents/fsa-clu.md](./docs/agents/fsa-clu.md)
- Landlord and farm-owner reports — [docs/agents/reports.md](./docs/agents/reports.md)
- Weather and rainfall — [docs/agents/weather-rainfall.md](./docs/agents/weather-rainfall.md)
- Billing, Free, and Pro — [docs/agents/billing.md](./docs/agents/billing.md)
- Equipment (live for every user; do not replace the meter RPCs) — [docs/agents/equipment.md](./docs/agents/equipment.md)
- Cattle (off unless `runs_cattle`; groups and moves are free; events, transfers, and CSV are Pro) — [docs/agents/cattle.md](./docs/agents/cattle.md)
- Offline, native, and accounts — [docs/agents/offline-native.md](./docs/agents/offline-native.md)
- Owner disaster recovery (tooling exists; drills are not done) — [docs/agents/owner-dr.md](./docs/agents/owner-dr.md)
- UI, accessibility, and React — [docs/agents/ui.md](./docs/agents/ui.md)
- Tests — [docs/agents/testing.md](./docs/agents/testing.md)
- CI, release, and git remotes — [docs/agents/ci-release.md](./docs/agents/ci-release.md)
- Coding style — [docs/agents/coding-style.md](./docs/agents/coding-style.md)

Primary source files, after the topic file:

- Weather proxy and rainfall location — [api/weather-proxy.ts](./api/weather-proxy.ts), [src/lib/fieldLocation.ts](./src/lib/fieldLocation.ts), [src/services/WeatherService.ts](./src/services/WeatherService.ts)
- Report PDFs and the spray log — [src/lib/complianceReports/pdfBranding.ts](./src/lib/complianceReports/pdfBranding.ts), [src/lib/complianceReports/fsa578PdfExport.ts](./src/lib/complianceReports/fsa578PdfExport.ts), [src/lib/sprayExport.ts](./src/lib/sprayExport.ts)
- Landlord summary — [src/lib/complianceReports/generateLandlordSummary.ts](./src/lib/complianceReports/generateLandlordSummary.ts)
- FSA tracts and CLU — [src/lib/cluImport.ts](./src/lib/cluImport.ts), [src/store/useFsaTracts.ts](./src/store/useFsaTracts.ts)
- Spray form — [src/hooks/useSprayForm.ts](./src/hooks/useSprayForm.ts), [src/lib/compliance/profiles.ts](./src/lib/compliance/profiles.ts)
- Activity helpers — [src/lib/utils.ts](./src/lib/utils.ts), [src/hooks/useUndoDelete.ts](./src/hooks/useUndoDelete.ts), [src/lib/activityIcons.ts](./src/lib/activityIcons.ts)
- Billing — [server/billing.ts](./server/billing.ts), [src/lib/billing.ts](./src/lib/billing.ts), [api/stripe-webhook.ts](./api/stripe-webhook.ts)
- Ask the Book — [src/lib/askBookAccess.ts](./src/lib/askBookAccess.ts), [api/ai-assistant.ts](./api/ai-assistant.ts), [server/ai-assistant-tools.ts](./server/ai-assistant-tools.ts)
- Native, offline, accounts — [src/lib/native.ts](./src/lib/native.ts), [src/lib/offlineStorage.ts](./src/lib/offlineStorage.ts), [src/lib/accountDeletion.ts](./src/lib/accountDeletion.ts)
- Owner recovery runbooks — [docs/runbooks/full-project-recovery.md](./docs/runbooks/full-project-recovery.md), [docs/runbooks/single-farm-recovery.md](./docs/runbooks/single-farm-recovery.md)
- Release — [codemagic.yaml](./codemagic.yaml), [IOS_RELEASE.md](./IOS_RELEASE.md), [docs/app-store/metadata.en-US.json](./docs/app-store/metadata.en-US.json)
- Tests — [src/test/supabaseMock.ts](./src/test/supabaseMock.ts), [src/test/hookTestHarness.tsx](./src/test/hookTestHarness.tsx)
- Dates, numbers, and season years — [src/utils/dates.ts](./src/utils/dates.ts), [src/utils/numbers.ts](./src/utils/numbers.ts), [src/lib/seasonYears.ts](./src/lib/seasonYears.ts)
- Customer plan copy — [src/copy/entitlements.ts](./src/copy/entitlements.ts)
- Cattle — [src/types/cattle.ts](./src/types/cattle.ts), [src/store/useCattle.ts](./src/store/useCattle.ts), [src/lib/cattle](./src/lib/cattle), [supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql](./supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql)
