# Data safety

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: scripts/check-farm-writes.mjs, scripts/farm-write-guard.mjs, scripts/farm-table-migration-guard.mjs, src/lib/syncQueue.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [Data Safety](#data-safety-1)
- [Farm Scoping](#farm-scoping)
- [Season Scoping](#season-scoping)
- [Mapper Discipline](#mapper-discipline)
- [Optimistic Update Pattern](#optimistic-update-pattern)
- [Supabase and Database](#supabase-and-database)
<!-- contents:end -->

## Data Safety

- `npm run lint` (`scripts/check-farm-writes.mjs`) rejects Supabase `.delete()` on farm-owned tables in `src/` and `supabase/functions/`. Soft-delete by setting `deleted_at` to an ISO timestamp.
- Active records always have `deleted_at === null`.
- Client logic must exclude soft-deleted records.
- Supabase RLS must also exclude or protect soft-deleted records where applicable.

## Farm Scoping

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

## Season Scoping

- Always stamp new records (both inside CRUD hooks and client components like `SprayModal.tsx`) with the user's currently selected `viewingSeason` (retrieved from `useFarm()`), not `activeSeason`.
- `activeSeason` represents the farm's currently active/current crop year. `viewingSeason` represents the season the user is currently viewing in the sidebar/UI.
- All record-creation and record-editing forms or modals must indicate their target season year in the title, and write actions must scope to `viewingSeason`.
- The local storage key `al_viewing_season` (with a user-scoped prefix) stores the current viewing season.
- On loading or syncing, `viewingSeason` must be validated and clamped to `[activeSeason - 10, min(activeSeason + 1, currentYear + 1)]`. Use the shared helpers in `@/lib/seasonYears.ts`; do not duplicate year-window arithmetic.
- Dropdown selectors (e.g. sidebar, activity, reports) must fetch dynamic options (`seasonOptions`) computed from `farmStore.tsx` rather than hardcoding options. The options must seed the allowed next season for pre-season planning, unless `activeSeason` is already `currentYear + 1`.
- `profiles.active_season` is synchronized across signed-in devices through a filtered Supabase Realtime subscription in `useAuth.ts`, with foreground/focus/online profile refresh as recovery for suspended sockets. If the device was viewing the previous active season, a remote rollover must advance `viewingSeason` to the new active season; a different historical selection is preserved when it remains valid and otherwise clamped.
- **Exception — grain bin inventory:** grain movements are still season-stamped on insert (`seasonYear: viewingSeason`), but bin *inventory* is continuous physical state and must be read season-independently via `getBinTotal(binId)` (no season arg → all-season total). Carryover grain vanishes and becomes unsellable if bin contents are scoped to the viewing season. Season-scoped views (history, reports) are fine; the Logistics bin monitor, SellModal inventory check, and DashboardStats bin totals must use the all-season total.

## Mapper Discipline

- Always call the relevant mapper before touching React state.
- Mappers must convert camelCase app objects to snake_case database rows.
- Optional fields must be sent as `null`, not `undefined`.
- Use mapper safety helpers such as `safeNum` and `safeStr` where appropriate.
- Mappers for user-managed reference data must preserve `id`, `farm_id`, and `deleted_at`.

## Optimistic Update Pattern

Full pattern and reference hooks: [BLUEPRINT → Optimistic Update Pattern](../../BLUEPRINT.md#optimistic-update-pattern).

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

## Supabase and Database

Canonical detail: [BLUEPRINT → Database Conventions](../../BLUEPRINT.md#5-database-conventions).

- `npm run lint` (`scripts/check-farm-writes.mjs`) rejects `.upsert()` in `src/` and `supabase/functions/` except `fsa_tract_imports` and `field_clu_assignments`. The replay call in `src/lib/syncQueue.ts` is `farm-write-allowlist: upsert` because it runs only for those two tables. The rainfall upserts in `mrms-backfill`, `mrms-daily`, and `mrms-hourly` are allowlisted the same way: they write radar rows on a natural key. Conflict keys: [BLUEPRINT → FSA / CLU Upsert Exception](../../BLUEPRINT.md#fsa--clu-upsert-exception).
- `npm run lint` (`scripts/check-farm-writes.mjs`) rejects `.select()` chained after `.update()` in `src/` and `supabase/functions/`. Use `.update(payload, { count: 'exact' })` and check `count === 1` or `count === ids.length`.
- Public tables/views/materialized views must not grant PG17 MAINTAIN to anon, authenticated, or PUBLIC. See [BLUEPRINT → Data API Access](../../BLUEPRINT.md#data-api-access-mandatory) for default-privilege limits and rollback scope.
- New migrations use unique 14-digit timestamp filenames: `YYYYMMDDHHMMSS_name.sql` (checked by `npm run verify:migrations`).
- `npm run verify:migrations` (`scripts/farm-table-migration-guard.mjs`) rejects a new public table with `farm_id` (migrations after `20261110190000`) that skips RLS, grants DELETE to anon, authenticated, or PUBLIC, grants anything to anon, or has a client SELECT policy without `deleted_at IS NULL`.
- Also keep the restrictive "no updates on deleted rows" policy from [BLUEPRINT → Data API Access](../../BLUEPRINT.md#data-api-access-mandatory). The migration guard does not check that policy. Pending production apply (owner approval): `20261017041928_apply_missing_safeguards.sql` consolidates the unique-active-grain index, farm-scoped harvest/grain FK, and anon revoke on the 12 core tables.
- New `public` tables, functions, and sequences need explicit `GRANT`s to `authenticated` and/or `service_role`. Default privileges no longer give client roles (or PUBLIC) access.
- `profiles` is a security boundary: clients may update only `active_season` and `onboarding_complete`; farm membership is assigned only through `ensure_user_farm`. `active_season` stays within `[2000, currentYear + 1]`, including inside any `SECURITY DEFINER` RPC such as `restore_farm_backup`. Details: [BLUEPRINT → Profile Membership Protection](../../BLUEPRINT.md#profile-membership-protection).
- Live profile-security tests assert PostgreSQL `42501` using non-mutating probes only (see [Testing](./testing.md#testing)).
- Private quota state (weather proxy, Ask the Book) lives in non-exposed schemas behind `SECURITY DEFINER` wrappers that derive identity from `auth.uid()`, use an empty `search_path`, and deny `PUBLIC`/`anon`.
- Do not bypass RLS assumptions in client code.
