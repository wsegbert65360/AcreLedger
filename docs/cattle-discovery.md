# Cattle feature discovery (Phase 0)

Date: 2026-11-14  
Branch: `feat/cattle`  
Scope: repository inspection only; no production database or deployment action was taken.

## 1. Main screen and the Equipment card

- The home route is `src/pages/Index.tsx`. It reads `equipment` and `maintenanceSchedules` from the farm store at lines 35-43, derives the due count at lines 146-148, and currently shows the Equipment card only when Equipment is enabled **and at least one equipment row exists** (`showEquipmentCard`, line 149).
- The Equipment card renders at `src/pages/Index.tsx:240-253`, immediately after `WeatherBar` (`src/pages/Index.tsx:237-239`). It is one full-width flex link with `min-h-14`, a Tractor icon, machine count, and due/current status.
- The main content wrapper is a vertical `space-y-4` stack (`src/pages/Index.tsx:233-236`). To put Equipment and Cattle in one row, wrap the two links in a `grid grid-cols-2 gap-*`; each link becomes one grid child. When `runs_cattle` is false, render the existing Equipment link without that two-column wrapper (or make it span both columns) so its current width and content remain unchanged.
- The Equipment route is lazy-loaded in `src/App.tsx:51` and registered with `ErrorBoundary` at `src/App.tsx:135`. Cattle needs the same route pattern.
- Risk/ambiguity: the requested Cattle tile is described as sitting beside Equipment whenever Cattle is enabled, but today the Equipment home card is absent when there are zero machines. Product direction is needed on whether enabling Cattle should also force an empty Equipment tile to appear.

## 2. Equipment end to end and every registry touched by a new farm table

### Types, mappers, state, and reads

- Canonical app and database-row types are in `src/types/equipment.ts:1-113`.
- Database-to-app mappers are in `src/lib/mappers.ts:71-119`. Insert/restore and update mappers are at `src/lib/mappers.ts:467-579`; they explicitly send `deleted_at` (`src/lib/mappers.ts:485-487`, `504`, `519`, `538`, `556`, `578`). Restore wrappers are exported at `src/lib/restoreMappers.ts:111-113`.
- `useEquipment` owns optimistic CRUD and RPC persistence in `src/store/useEquipment.ts:79-570`. Direct writes choose online versus queue at lines 90-149; atomic RPC envelopes use `EQUIPMENT_RPC_KEY` at lines 151-184. Rollbacks normally target only touched IDs, including maintenance logging at lines 458-535.
- `farmStore` declares Equipment state in `src/store/farmStore.tsx:105-108`, creates it at lines 302-304, clears it at lines 353-355, hydrates its three offline caches at lines 448-473 and 499-500, and saves those caches at lines 839-841.
- Cloud reads are in `src/store/farmStore.tsx:527-767`. Equipment tables are fetched at lines 630-639. Their errors are fail-soft and keep cached data (`src/store/farmStore.tsx:647-660`); queued changes are overlaid and parked RPC effects applied at lines 707-727; successful results enter state at lines 745-749.
- `useEquipment` is composed into global state at `src/store/farmStore.tsx:865-869`, and active Equipment rows plus operations are exposed at `src/store/farmStore.tsx:1091-1106`.

### Sync queue and RPC replay

- The queue table allowlist is `src/lib/syncQueue.ts:70-78`.
- Equipment's RPC key, allowlist, envelope reader, and non-retryable SQLSTATE set are at `src/lib/syncQueue.ts:19-61`.
- Atomic envelopes claim their root and related equipment/schedule row keys at `src/lib/syncQueue.ts:228-236`, which keeps later writes behind earlier queued work.
- Replay detects the envelope and invokes only allowlisted RPCs at `src/lib/syncQueue.ts:812-853`; ordinary inserts/updates/deletes follow at lines 854-907.
- Equipment RPC errors `P0002`, `23505`, `23514`, and `P0402` are parked at once (`src/lib/syncQueue.ts:31-32`, `941-949`). The generic premium outcome also parks work and uses the shared "Pro needed to sync" copy at `src/lib/syncQueue.ts:1002-1017`.
- Tombstone/unknown-outcome reconciliation is server-allowlisted in `supabase/migrations/20261013041046_reconcile_equipment_offline_sync.sql:7-60`; its table list is lines 21-28. New ordinary cattle tables must be added there if direct queued operations need zero-row reconciliation.
- Queue persistence keys themselves are centralized in `src/lib/syncQueueKeys.ts:1-2`; no feature-specific storage key is required.

### Database, restore, owner recovery, deletion, exports, and test data

- Equipment schema, composite tenant FKs, indexes, triggers, grants, RLS, and `log_maintenance` begin in `supabase/migrations/20261006214500_equipment_maintenance.sql:1-260`. The SELECT policies exclude tombstones at lines 106-110, 124-128, and 142-146; restrictive UPDATE policies are lines 121-122, 139-140, and 157-158. Client grants deliberately omit DELETE at lines 160-165.
- Atomic meter/cascade RPCs live in `supabase/migrations/20261006233000_equipment_meter_rpcs.sql`. The cascade soft-delete RPC is lines 240-320; explicit RPC grants are lines 499-506.
- Customer restore support is currently finalized by `supabase/migrations/20261009024113_restore_equipment_task_name_conflicts.sql:22-133` (superseding the first Equipment restore migration). Any new cattle restore migration must replace/extend the latest `restore_farm_backup` implementation rather than patching an old historical body.
- Portable backup schemas and keys are in `src/lib/backupSchema.ts:343-391` and `419-467`; restore mapping/payload construction is in `src/store/useSeasonManagement.ts:393-478`; Settings backup collection/count/export wiring is in `src/components/settings/BackupManager.tsx:36-145` and its summary at lines 164 onward. Pre-rollover backup wiring is in `src/store/useSeasonManagement.ts:280-357`.
- Pre-season rollback key-to-table registration is `src/lib/backupRestorePolicy.ts:37-72`. Because cattle is continuous, product direction should decide whether pre-season reset snapshots merely carry it unchanged (Equipment precedent) or omit it from rollback.
- Owner disaster-recovery classification is `scripts/recovery/tenant-registry.ts`; Equipment entries demonstrate parent-before-child restore order at lines 323-355. The static coverage list is `scripts/recovery/tenant-registry.test.ts:11-46`, and the live `information_schema` coverage is `scripts/recovery/tenant-registry.integration.test.ts:7-45`. Adding farm-owned tables requires updating both the registry and coverage and bumping `TENANT_REGISTRY_VERSION` (`scripts/recovery/tenant-registry.ts:35`) because the archive/recovery layout changes.
- Account deletion is farm-root based: a farm deletion cascades through child FKs. The disposable proof is `scripts/test-account-deletion-migration.mjs:20-68`; cattle fixture tables and cascade assertions should be added there. The client only creates the deletion request (`src/lib/accountDeletion.ts:3-16`).
- Equipment's only raw CSV is its maintenance export, not a whole-farm raw export: `src/lib/equipment/export.ts:6-49`, called from `src/pages/Equipment.tsx:332,337`. Formula injection is neutralized by `sanitizeCsvValue` at `src/utils/csv.ts:1-10`. There is no existing global "raw CSV export" registry to extend; Phase 2 would need a cattle export surface defined rather than simply registering tables.
- Generated test fixtures include Equipment in `src/test/generateTestData.ts:372-446` and the returned farm dataset at lines 462-484. AGENTS requires new customer farm data to be added there.
- Database integrity runs Equipment's script through `package.json:24`. Cattle needs its test script added to that chain.
- Per the explicit product rule, cattle tables must **not** be added to `server/ai-assistant-tools.ts`; catalog-isolation tests should document that intentional exclusion because `AGENTS.md` otherwise requires new user-facing tables to be classified.

### Complete new-table checklist

Each of `cattle_groups`, `cattle_moves`, and `cattle_events` must be represented in:

1. a committed timestamped migration (schema/RLS/grants/RPCs and restore integration),
2. `src/types/cattle.ts`,
3. `src/lib/mappers.ts` and `src/lib/restoreMappers.ts`, plus mapper tests,
4. `src/store/useCattle.ts` and its hook tests,
5. `src/store/farmStore.tsx` (state, clear, cache hydrate/save, conditional fail-soft fetch, queue overlay, public context),
6. `src/lib/syncQueue.ts` (table and RPC allowlists, related-row keys, replay/error behavior),
7. the latest `get_offline_sync_row_state` allowlist migration where relevant,
8. `src/lib/backupSchema.ts`, `src/lib/backupRestorePolicy.ts`, `src/store/useSeasonManagement.ts`, and `src/components/settings/BackupManager.tsx`,
9. the latest `restore_farm_backup` SQL body,
10. `scripts/recovery/tenant-registry.ts`, `scripts/recovery/tenant-registry.test.ts`, and owner-recovery tests,
11. `scripts/test-account-deletion-migration.mjs`,
12. `src/test/generateTestData.ts`,
13. cattle raw CSV builder/tests using `src/utils/csv.ts`, and
14. `scripts/test-cattle-migrations.mjs` plus the `package.json` database-integrity chain.

## 3. Farm-level setting and offline behavior

- There is no existing offline-writable farm-level boolean setting. Device-local regional preferences are not farm settings (`src/store/useAppPreferences.ts`), and `profiles.active_season`/`onboarding_complete` are user profile state, not appropriate for a shared farm capability.
- The farm row is read for `name` at `src/store/farmStore.tsx:573-589`. Clients have SELECT-only RLS on their farm (`supabase/migrations/20260514100000_fix_security_policies_and_grants.sql:70-76`); farm name changes go through a tenant-derived SECURITY DEFINER RPC (`supabase/migrations/20260620015200_initialize_active_season_and_rename_rpc.sql:54-90`, called at `src/store/farmStore.tsx:1003-1042`).
- Pick: add `public.farms.runs_cattle boolean NOT NULL DEFAULT false`. It is truly farm-scoped, defaults safely for every existing farm, survives account/device changes, and avoids weakening the protected `profiles` update boundary.
- Read `name, runs_cattle` together and cache one small farm metadata object (extending the existing farm-name cache pattern at `src/store/farmStore.tsx:842-847`). Expose `runsCattle` and `setRunsCattle` from `useFarm()`.
- Write via a tenant-derived, idempotent `set_runs_cattle(boolean)` RPC and queue it with a dedicated allowlisted RPC envelope. A normal queued table update cannot target `farms` safely because queue replay always adds/filters a `farm_id` column (`src/lib/syncQueue.ts:876-895`), while `farms` is keyed by `id` and has no `farm_id` column. The UI should optimistically cache the boolean and roll back only that setting on a definitive failure.
- Fetch sequencing matters: cattle reads must be skipped while the setting is false. Since the current farm metadata read and collection `Promise.all` start together (`src/store/farmStore.tsx:573-641`), fetch must first resolve/cached-overlay `runs_cattle`, then conditionally issue the three fail-soft cattle queries without making other collections wait on a cattle error.

## 4. Field picker and pasture identification

- There is no shared generic field-picker component. The closest reusable interaction is the Quick Add field `Select` in `src/components/QuickAddDialog.tsx:260-303`; it uses a 44px `SelectTrigger`, active fields, and FSA display acreage. Cattle Move should extract/reuse a small picker component or faithfully reuse this Select pattern rather than coupling to Quick Add's activity/GPS state.
- `Field` has no enum/type dedicated to pasture. It has free-text `intendedUse` (`src/types/farm.ts:33-70`, specifically line 52).
- Existing home and field-management classification treats an intended-use string containing `pasture` **or `hay`** as “Pasture & hay” (`src/pages/Index.tsx:46-67`; `src/components/FieldManager.tsx:105-115`).
- For the cattle picker, “pasture first” can sort case-insensitive `intendedUse` values containing `pasture` ahead of other active fields. It should not automatically treat `hay` as pasture because the task explicitly forbids hay tracking and because a hay field is not necessarily grazed. All existing fields remain selectable.

## 5. Premium enforcement and the discovered contradiction

- Server: `assert_premium(farm, feature)` is defined at `supabase/migrations/20261107000000_entitlements_core.sql:113-141`. In off mode it allows, in shadow mode it logs, and in enforce mode a free farm receives `P0402 premium_required:<feature>`.
- Equipment writes are server-gated by BEFORE INSERT/UPDATE triggers in `supabase/migrations/20261107050000_paid_feature_guards.sql:10-45`, using feature `equipment`. SELECT remains untouched. Soft delete is explicitly allowed at lines 17-20.
- Client entitlement state is display-only and cached by `src/hooks/useEntitlement.ts:42-105`; `isFreeTierLocked` is the common enforced-free predicate (`src/lib/entitlements.ts:56-59`). Upgrade strings live in `src/copy/entitlements.ts:1-68` and are all marked DRAFT at lines 1-2.
- Sync: `P0402` is detected by `src/lib/entitlements.ts:98-103` and parked immediately with the shared outcome at `src/lib/syncQueue.ts:1002-1017`.
- **Contradiction requiring owner direction:** Equipment is **not** gated in its page with `useEntitlement()`. `src/pages/Equipment.tsx` has no entitlement import/call; its Add, Meter, Service, and Repair controls remain visible and rely on server refusal. `BLUEPRINT.md:442-465` also says the Equipment route/card/Settings link are live for every user. Therefore Phase 6's instruction to use “`useEntitlement()` in the UI, same pattern as Equipment” names a client pattern that does not exist. Before Phase 1, William must choose whether Cattle Events should (A) follow the written Cattle requirement and add a new explicit client upgrade gate, or (B) follow actual Equipment behavior and leave event controls visible until the server refuses the write. The stated Phase 6 outcome (“Free farms see the Events section with the upgrade prompt”) suggests A, but proceeding would be an assumption after a discovered contradiction.
- The premium feature union/SQL allowlist must gain a cattle-events feature name (for example `cattle_events`) in `src/lib/entitlements.ts:29-32` and the server validation used by `assert_premium`; this name must match `premium_required:<feature>` exactly.

## 6. Soft delete and RLS precedent

- Client Equipment delete optimistically tombstones the machine and children, then queues/calls one atomic RPC envelope (`src/store/useEquipment.ts:351-379`). Its rollback restores only the touched IDs.
- Server cascade is `soft_delete_equipment_cascade` (`supabase/migrations/20261006233000_equipment_meter_rpcs.sql:240-320`): tenant check, row locks, idempotent already-deleted result, children first, parent last. Grants are explicit at lines 502-503.
- Equipment RLS SELECT policies require both current-farm membership and `deleted_at IS NULL` (`supabase/migrations/20261006214500_equipment_maintenance.sql:106-110`, `124-128`, `142-146`). INSERT/UPDATE policies are farm-scoped; restrictive UPDATE policies prevent editing an already-deleted row. Grants provide `SELECT, INSERT, UPDATE`, never DELETE (`160-165`). Cattle tables should copy this structure.
- Cattle's `soft_delete_cattle_row` needs an allowlisted row kind/table discriminator (never arbitrary caller-selected SQL), farm/row locking, idempotency, group child cascade, event delta reversal with a non-negative result check, explicit REVOKE/GRANT, and one queued RPC envelope.

## 7. `test-equipment-migrations.mjs` setup

- `scripts/test-equipment-migrations.mjs:1-25` loads the exact schema/RPC/restore/helper migrations as strings.
- Lines 27-52 create deterministic UUIDs, a disposable PGlite instance, API roles, `auth.uid()`, minimal `farms`/`profiles`, and grants. It never contacts a live database.
- Lines 53-109 apply migrations plus minimal dependency tables and restore stubs.
- Lines 110-237 set an authenticated tenant and test guarded direct updates, tenant isolation, higher-wins behavior, idempotent RPC replay, back-dated behavior, restore, conversion, and cascade deletion.
- Lines 238-300 exercise real restore conflict handling and tombstone reconciliation, then close PGlite at lines 303-304.
- `scripts/test-cattle-migrations.mjs` should use the same isolated shape, load the cattle schema and the entitlement core needed by the event guard, and cover: other-farm denial; same-ID RPC replay; newer versus back-dated moves; head count floor; each soft-delete mode; event reversal; grants/RLS; and backup restore of active and deleted rows. Add it to `package.json:24`.

## Files expected per phase

### Phase 1 — schema and RPCs

- `supabase/migrations/<timestamp>_cattle_schema_and_rpcs.sql`
- possibly a second ordered migration if restore or entitlement allowlists cannot safely be included in one migration
- latest `restore_farm_backup` implementation via the new migration
- latest `get_offline_sync_row_state` implementation via the new migration
- `scripts/test-cattle-migrations.mjs`
- `scripts/test-account-deletion-migration.mjs`
- `package.json`

### Phase 2 — data layer, backup/recovery/export/derivations

- `src/types/cattle.ts`
- `src/lib/mappers.ts`, `src/lib/restoreMappers.ts`, mapper tests
- `src/store/useCattle.ts`, `src/store/__tests__/useCattle.test.tsx`
- `src/store/farmStore.tsx`, `src/store/__tests__/farmStore.test.tsx`
- `src/lib/syncQueue.ts`, `src/lib/__tests__/syncQueue.test.ts`
- `src/lib/backupSchema.ts`, `src/lib/backupRestorePolicy.ts`, `src/lib/backupCompatibility.ts` if the backup version changes
- `src/store/useSeasonManagement.ts` and its tests
- `src/components/settings/BackupManager.tsx` and tests
- `scripts/recovery/tenant-registry.ts` and recovery tests
- `src/test/generateTestData.ts`
- new `src/lib/cattle/derived.ts`, `src/lib/cattle/export.ts`, and unit tests
- AI registry catalog-isolation test only, documenting the explicit exclusion (no cattle AI tools)

### Phase 3 — setting and home tile

- `src/store/farmStore.tsx` (farm metadata/cache and setting mutation)
- `src/pages/Settings.tsx` or a focused `src/components/settings/CattleManager.tsx`
- `src/pages/Index.tsx`
- `src/App.tsx`
- `src/pages/Index.test.tsx`, `src/pages/__tests__/Settings.test.tsx`, `src/App.test.tsx`

### Phase 4 — free screens

- new `src/pages/Cattle.tsx`
- new focused cattle form/list/detail components as needed
- `src/App.tsx`
- `src/pages/FieldDetailScreen.tsx`
- relevant page/component tests

### Phase 5 — Pro event entry and timeline

- cattle page/components and tests
- `src/store/useCattle.ts` and tests for atomic single/batched events
- `src/lib/syncQueue.ts` only if the two-event weaning envelope needs a distinct replay form

### Phase 6 — Free/Pro gate

- a new migration replacing `log_cattle_event` with `assert_premium` inside it
- `src/lib/entitlements.ts` and constant tests
- `src/hooks/useEntitlement.ts` consumer(s) on Cattle UI
- `src/copy/entitlements.ts` and copy tests (new strings marked DRAFT)
- cattle UI/store/sync queue tests

### Phase 7 — readiness and documentation

- `BLUEPRINT.md` and generated contents if headings change
- `AGENTS.md` feature-area index/recent change only after implementation is verified
- staging evidence document if the repository's release process requires one
- public-page cattle mentions to list, not edit: `src/pages/Landing.tsx`, `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`, and `docs/app-store/metadata.en-US.json`

## Risks and unresolved decisions

1. Client gating contradiction: Equipment has no `useEntitlement()` UI gate, while Phase 6 says to copy it. This blocks implementation pending William's choice.
2. Empty Equipment state: enabling Cattle may not have an Equipment tile to sit beside because the current home card requires at least one machine.
3. Farm setting queue: farms rows do not fit the generic `farm_id` replay contract; a dedicated setting RPC envelope is required.
4. Conditional fetch ordering: `runs_cattle` must be known before deciding whether to query cattle, without allowing a cattle error to fail the main fetch.
5. Back-dated moves need a deterministic tie rule for two moves on the same date. Date alone cannot identify “newest”; use `(moved_on, created_at, id)` or define same-day last-write semantics in the RPC and derived calculations.
6. Event deletion reversal can fail if later changes leave too few head; the RPC must refuse rather than make head count negative, leaving the tombstone unapplied.
7. Weaning's paired remove/add must be one offline atomic envelope and one server transaction; two independent queued RPC rows can partially apply.
8. There is no existing whole-farm raw CSV exporter to extend; the exact cattle raw-export UX/file format needs definition.
9. Customer backup currently exports active in-memory rows only. The requested “restore brings back deleted cattle rows” requires deliberately retaining cattle tombstones in state/cache/backup or a separate server-inclusive export path; the normal RLS SELECT policy hides deleted rows. Equipment's current portable backup cannot prove that stronger requirement.
10. The user asks for group head-count editing on every plan while events also mutate that count. Optimistic direct edits and queued event RPCs must claim the same group record key to preserve queue order.
11. No cattle table may enter Ask the Book, even though the general new-table checklist normally requires read-registry coverage; exclusion tests/documentation must make this intentional.
12. No production deploy, production database command, or Supabase push is part of this work. All migration tests must stay in disposable PGlite.
