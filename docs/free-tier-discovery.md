# Free tier discovery (Phase 0) - 2026-11-06

Branch `feat/free-tier` off `main` @ a5ffd3b. Read-only; no code changed. Status: **first pass**. Items marked OPEN still need a deeper read or a prod query.

## 1. Trial / subscription logic
- Trial is set per farm in `farms.trial_started_at/trial_ends_at` (`supabase/migrations/20261021194611_farm_trial_columns.sql:4`) and mirrored from Stripe in `farm_subscriptions.trial_ends_at` (`20260909184850_farm_subscriptions.sql:13`, `server/billing.ts:297,308`).
- Checkout: `api/create-checkout-session.ts:169-176` reads `farms.trial_ends_at`, `getCheckoutTrialEnd()` at `server/billing.ts:190`.
- Access helpers: client `getFarmBillingAccess` (`src/lib/billing.ts:60`), server `canStartCheckout` (`server/billing.ts:125`), `resolveCurrentPeriodEnd` (`:282`, basil shape already handled). `PAST_DUE_GRACE_DAYS = 14` exists in both files.
- Trial UI: `FarmTrialBanners.tsx`, `BillingManager.tsx:50,69,230`, `useFarmTrial.ts`.
- **Correction:** the real signup trial is **3 months**, stamped by `ensure_user_farm()` (`20261021194611_farm_trial_columns.sql:110`) with a `trial_claims` identity guard. Checkout only reuses `farms.trial_ends_at` (`server/billing.ts:190`); it never creates a new trial. The "122-day" wording in docs is stale (see item 9).
- OPEN: what happens at `trial_ends_at` today (appears to be nothing; billing is inert).

## 2. Report generation - **CLIENT-SIDE ONLY**
FSA-578, landlord statement/summary, fertilizer, spray audit/export are generated in the browser (`src/lib/complianceReports/*`, `src/lib/sprayExport.ts`, `src/components/reports/*`, `src/pages/Reports.tsx`). No server endpoint produces them (`api/` has only ai-assistant, billing-eligibility, checkout, portal, webhook, weather-proxy).
**Consequence:** gating reports can only be a client check unless generation moves server-side. Client gating is bypassable; the data is already readable via SELECT. Needs William's decision (see questions).

## 3. Rainfall pipeline
- `supabase/functions/mrms-hourly/index.ts:74` and `mrms-backfill/index.ts:153` each page `fields` (`id, lat, lng`), filter `deleted_at IS NULL` and non-null lat/lng, order by id. Admin client, all farms.
- `api/weather-proxy.ts` has no field logic (not a per-field rain API). OPEN: locate the "Rain API" (`C:\Projects\Rain api` is a separate folder) and how the app reads `field_rainfall_hourly`.
- Phase 4 shared function must replace both selects.

## 4. Write paths for paid-only tables
- Equipment (3 tables): RPCs in `20261006214500_equipment_maintenance.sql` (`log_maintenance`, etc.) plus direct updates; read in `farmStore.tsx:631`.
- Grain: `src/store/useGrainMovements.ts:62,163,453` direct table writes; base table `20260316090000_core_harvest_grain_baseline.sql:169`; linked harvest+grain RPC.
- OPEN: landlords/splits, costs, reminders, CLU/tract tables (no hits for my table-name guesses; need real names).

## 5. Device identity
Nothing exists: no `device_id`, `user_devices`, or sessions table. Phase 5 device limit needs a new table plus a registration step on sign-in.

**DEFERRED (decision 2026-11-08): the one-device limit for free farms is NOT built on this branch.**
It is the largest and most disruptive item (device table, register-on-sign-in, refusing a second device) and the other
free limits already cover the plan. Revisit after the shadow run. If built later: device registry table + register-on-sign-in
RPC + its own flag in `entitlement_config` (default off), tested before enabling, with a clear refusal message and upgrade
link, and never locking out a farm's only device. `deviceCap: 1` stays in FREE_LIMITS but nothing enforces it.

## 6. Season model
No seasons table found. Season is a client value (`activeSeason`, `viewingSeason` in `farmStore`; `useSeasonManagement.ts`), stamped onto records via mappers. "Current + last season" is derivable as `activeSeason` and `activeSeason - 1`. OPEN: confirm records carry a season/year column server-side.

## 7. Photos
Stored as **base64 inside spray `notes`** as `[ATTACHMENT:data:image/...;base64,...]` (`src/hooks/useSprayForm.ts:73,582`, `src/lib/sprayExport.ts:42`). No storage bucket use found. One photo per spray record. Plan requires migration to storage. OPEN: prod counts (read-only query not yet run).

## 8. Backup/restore and CSV import
- Restore: `_restore_table_for_farm` and versioned restore RPCs (`20260711005204`, `20260716015958`, `20261015175710`, equipment/grain conflict migrations).
- CSV import entry points: OPEN. Only CSV *export* found so far (`src/utils/csv.ts`, report components, `src/lib/equipment/export.ts`).

## 9. Trial-length wording ("122-day" / "4-month")
- `.env.example:39`
- `docs/product-description.md:14,107,151`
- `docs/validation/2026-09-19-stripe-test-mode-billing.md:7,107`
- `docs/app-store/2026-10-01-review-acceptance.md:66` (says avoid fixed free periods)
- `CODE_REVIEW_2026-09-29_FullReview.md:27,54` (historical record, leave)
- Project description (William to update). Public pages: OPEN, grep `Landing.tsx`/legal pages for "free trial".

## Update 2026-11-08
- **Rain API** (`C:\Projects\Rain api`, separate Vercel Hobby project, IEM-based) is open and cannot be gated by the server entitlement. Free-tier rainfall limits are enforced on the Supabase side (collection and `get_field_rainfall_daily`). Check Vercel Hobby commercial-use terms.
- **Section 9 wording cleanup:** done for `.env.example`, `docs/product-description.md`, and dated notes on the two historical docs. Public-page lines are listed in `docs/free-tier-handoff.md`, not edited.
- Hand-off summary: `docs/free-tier-handoff.md`.
