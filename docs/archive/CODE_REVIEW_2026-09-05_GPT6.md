# AcreLedger — Deep Code Review

**Reviewed by:** OpenAI Codex CLI 0.153.4 · model `gpt-6-astra` · sandbox: read-only
**Date:** 2026-09-05 · **Scope:** full codebase (src/, api/, server/, supabase/, migrations/)

---

# AcreLedger — consolidated code audit

**The highest-priority issues concern FSA/CLU persistence, incomplete data loading, offline durability, and grain inventory consistency.** No Critical issue was established.

This was a broad static review across frontend state and forms, services, API handlers, the assistant registry, offline storage, reports, Supabase functions, and both migration directories. Database findings describe the checked-in schema; I did not verify the deployed database’s migration state.

No files were changed.

## Verification

| Check | Result |
|---|---|
| Frontend TypeScript, `tsconfig.app.json`, no emit | Passed |
| API/server TypeScript, `tsconfig.api.json`, no emit | Passed |
| ESLint over `src`, `api`, and `server`, errors only | Passed |
| Unit suite | Blocked during startup by `spawn EPERM`; no tests executed |
| In-memory reproductions using production code | Confirmed encryption and replay failures below |
| Live database, browser, and native-device verification | Not performed |

## High severity

### H1. Latest migration breaks FSA/CLU upserts and backup restore

**Locations:** [migration:4](C:/projects/AcreLedger/supabase/migrations/20260905092000_soft_delete_parity_fsa_clu.sql:4), [tract service:24](C:/projects/AcreLedger/src/services/fsaTractService.ts:24), [assignment service:25](C:/projects/AcreLedger/src/services/cluAssignmentService.ts:25), [restore helper:152](C:/projects/AcreLedger/supabase/migrations/20260716015958_preserve_restore_payload_columns.sql:152).

The September migration removes the full unique constraints and replaces them with indexes restricted to `deleted_at IS NULL`. All four persistence paths—services, offline replay, and restore—still specify conflict columns without the partial-index predicate.

Once applied, the migration makes those conflict targets invalid, producing PostgreSQL `42P10`. This affects ordinary new imports and assignments, not merely reactivations. Restoring a backup containing these records fails transactionally.

The migration also introduces restrictive update policies that prevent the sanctioned resurrection of soft-deleted FSA/CLU rows. Restoring the constraints alone therefore does not fully repair the contract. PostgreSQL documents the relevant [conflict-index inference rules](https://www.postgresql.org/docs/current/sql-insert.html).

**Fix:** Add a corrective migration restoring the full unique keys and the narrowly farm-scoped resurrection behavior required by `AGENTS.md`. Test import, reassignment after deletion, offline replay, and backup restore against the resulting database.

### H2. Farm loading silently truncates collections at the API row limit

**Locations:** [farmStore.tsx:326](C:/projects/AcreLedger/src/store/farmStore.tsx:326), [config.toml:17](C:/projects/AcreLedger/supabase/config.toml:17).

`fetchData()` makes one request per table, without pagination. The checked-in API limit is 1,000 rows. Activity queries span all seasons but order only by season, so sufficiently large collections are silently incomplete.

Consequences include incorrect bin inventory, missing historical activity, incomplete compliance reports, and backups that appear successful while omitting records.

**Fix:** Page every complete-collection read with deterministic ordering and a unique tiebreaker. Mark loading complete only after every page succeeds. Keep physical grain inventory independent of viewing-season filters.

### H3. Encryption fails for moderately large cache and queue payloads

**Location:** [crypto.ts:56](C:/projects/AcreLedger/src/utils/crypto.ts:56).

```ts
String.fromCharCode(...new Uint8Array(encrypted))
```

This passes every encrypted byte as a function argument, exceeding engine argument limits.

**Reproduced:** Production `encryptData()` succeeded for 100 KB but failed for 200 KB and 500 KB with `Maximum call stack size exceeded`.

Spray attachments, tract geometry, or accumulated records can reach this size. Offline mutations fail to enqueue; cache writes swallow the failure, leaving stale or absent offline data.

**Fix:** Use chunked binary-to-base64 conversion. Add round-trip tests with realistic attachment and GeoJSON payloads well above the engine’s argument limit.

### H4. Concurrent first-use encryption initialization generates incompatible keys

**Locations:** [crypto.ts:9](C:/projects/AcreLedger/src/utils/crypto.ts:9), [farmStore.tsx:430](C:/projects/AcreLedger/src/store/farmStore.tsx:430).

Key initialization performs an asynchronous read, generates a key if absent, then writes it without synchronization. The store starts many cache operations independently.

**Reproduced:** Sixteen simultaneous calls returned sixteen different keys; only one matched the final persisted key. Data encrypted with the other keys becomes unreadable.

**Fix:** Share one initialization promise and cache the resolved key. Protect initialization across browser tabs as well, or use storage with transactional key creation.

### H5. Permanent database errors can block the entire offline queue indefinitely

**Locations:** [syncQueue.ts:79](C:/projects/AcreLedger/src/lib/syncQueue.ts:79), [syncQueue.ts:426](C:/projects/AcreLedger/src/lib/syncQueue.ts:426).

`isNetworkError()` considers an absent `error.status` a network failure. Normal PostgREST errors contain `code`, `message`, `details`, and `hint`; HTTP status belongs to the surrounding response.

Consequently, constraint and authorization failures stop replay before retries increase or unrelated mutations run.

**Reproduced:** A normal `23505` response followed by an unrelated queued insert remained blocked after three replays. Both retry counts stayed zero.

A particularly damaging trigger is an insert that committed remotely but whose response was lost: retry receives `23505` and permanently blocks subsequent work.

**Fix:** Classify the complete response using HTTP status and database code. Reconcile retried inserts by stable ID, and retain failed mutations in a recoverable state rather than discarding user work.

### H6. Replay deletes updates from the queue even when zero rows changed

**Locations:** [syncQueue.ts:406](C:/projects/AcreLedger/src/lib/syncQueue.ts:406), [syncQueue.ts:452](C:/projects/AcreLedger/src/lib/syncQueue.ts:452).

Replayed updates and soft deletes do not request or inspect affected-row counts. A missing or RLS-hidden target can return no error while changing nothing; replay then removes the mutation and reports success.

**Reproduced:** An update returning `{ error: null, count: 0 }` emptied the queue and returned `true`.

**Fix:** Request exact counts. Reconcile zero-row results before removing mutations: distinguish an already-completed operation from a missing target or conflict. Preserve unresolved edits for recovery.

### H7. Unscoped asynchronous completions can overwrite newer state or repopulate a signed-out account

**Locations:** [farmStore.tsx:254](C:/projects/AcreLedger/src/store/farmStore.tsx:254), [farmStore.tsx:279](C:/projects/AcreLedger/src/store/farmStore.tsx:279), [farmStore.tsx:388](C:/projects/AcreLedger/src/store/farmStore.tsx:388).

Cache hydration and cloud fetching run independently, with no request-generation or session-ownership check before applying results.

A slow cache read can overwrite a newer cloud result. Likewise, an outstanding request from account A can finish after sign-out or account B’s login and install A’s records into the shared provider. Persistence effects subsequently use the current session’s user ID.

This creates a plausible cross-account local-data exposure in addition to stale-state corruption. RLS protects the original query, not the later React state assignment.

**Fix:** Associate hydration, fetches, and persistence with a user/farm generation. Cancel or ignore obsolete completions, clear state at identity boundaries, and serialize initial hydration with queue replay and authoritative loading.

### H8. Grain’s optimistic-concurrency fingerprint does not change on ordinary edits

**Locations:** [useGrainMovements.ts:135](C:/projects/AcreLedger/src/store/useGrainMovements.ts:135), [GrainMovementModal.tsx:76](C:/projects/AcreLedger/src/components/GrainMovementModal.tsx:76), [useGrainMovements.ts:261](C:/projects/AcreLedger/src/store/useGrainMovements.ts:261).

Updates compare the previous activity `timestamp`, but the editor spreads `initialData` without changing that timestamp. Two devices editing bushels can therefore both match the same fingerprint and overwrite one another.

Deletion has no timestamp predicate, and offline updates do not retain an expected version.

**Fix:** Introduce a database-managed version distinct from the activity date. Increment it atomically and require the expected version for updates, deletes, and replay. Do not change historical activity timestamps merely to implement concurrency control.

### H9. Retrying a partially saved harvest creates duplicate production

**Location:** [HarvestModal.tsx:238](C:/projects/AcreLedger/src/components/HarvestModal.tsx:238).

New harvest creation saves the harvest first and its grain movement second. If movement creation fails, the harvest remains committed and the modal remains open. Retrying generates another harvest UUID and inserts another production record.

The unique movement-per-harvest index cannot prevent this because each attempt has a different harvest ID.

**Fix:** Persist the harvest and linked movement through one transactional operation, with an idempotency key retained across retries. Offline creation should similarly be one logical batch.

### H10. Deleting a harvest leaves its linked inventory movement active

**Locations:** [useHarvestRecords.ts:175](C:/projects/AcreLedger/src/store/useHarvestRecords.ts:175), [Activity.tsx:167](C:/projects/AcreLedger/src/pages/Activity.tsx:167).

Harvest deletion updates only `harvest_records.deleted_at`. Activity deletion invokes grain deletion only for independently selected grain records. The foreign key’s `ON DELETE SET NULL` does not run for soft deletes.

Deleting an erroneous bin harvest therefore removes its production record while retaining the incoming bushels in inventory.

**Fix:** Define and implement transactional soft-delete behavior for linked harvest movements. If movement retention is intentional, record an explicit inventory correction rather than silently leaving the two ledgers inconsistent.

## Medium severity

### M1. Grain-to-harvest references do not enforce tenant ownership

**Locations:** [harvest FK migration:18](C:/projects/AcreLedger/supabase/migrations/20260701120000_add_harvest_record_id_to_grain_movements.sql:18), [grain policies:40](C:/projects/AcreLedger/supabase/migrations/20260628100000_revoke_core_hard_deletes.sql:40), [unique index:23](C:/projects/AcreLedger/supabase/migrations/20260825213000_unique_active_grain_movement_per_harvest.sql:23).

The foreign key references only `harvest_records(id)`, while grain write policies validate only the movement’s `farm_id`.

Given another farm’s harvest UUID, an authenticated caller can create an own-farm movement referencing it. The globally unique active-harvest index can then prevent the owning farm from linking that harvest. This is an integrity/availability gap; it does not establish unauthorized reading of harvest contents. PostgreSQL’s [referential-integrity checks bypass RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**Fix:** Enforce a composite tenant-aware relationship, such as `(farm_id, harvest_record_id)` referencing `(farm_id, id)`. Audit other field/bin relationships similarly. Database constraints should also protect the privileged restore path.

### M2. Partial bulk deletion produces a false local rollback

**Locations:** [usePlantRecords.ts:233](C:/projects/AcreLedger/src/store/usePlantRecords.ts:233), [useGrainMovements.ts:270](C:/projects/AcreLedger/src/store/useGrainMovements.ts:270).

If another device already deleted one selected row, the bulk update can successfully delete the remaining rows but return a smaller count. The hook treats this as complete failure and restores every selected record locally.

The database transaction already committed. React rollback cannot undo it, leaving ghost records—and potentially false grain totals—until refresh.

**Fix:** Use a transactional RPC that validates the expected target set before updating, or reconcile the affected records with the database after a count mismatch. Do not restore the entire snapshot after a partially successful write.

### M3. Background refresh unmounts active forms

**Locations:** [farmStore.tsx:323](C:/projects/AcreLedger/src/store/farmStore.tsx:323), [App.tsx:153](C:/projects/AcreLedger/src/App.tsx:153).

Every refresh sets the global `loading` flag. `AppContent` then replaces the application with a loading screen, unmounting routes and modals.

A network reconnect while entering a record can therefore erase unsaved form state, despite the separate service-worker safeguards against mid-entry reloads.

**Fix:** Separate initial bootstrap loading from background refreshing. Keep the application mounted during reconnects and refreshes.

### M4. Multiple activity forms default to the wrong local date

**Locations:** [PlantModal.tsx:125](C:/projects/AcreLedger/src/components/PlantModal.tsx:125), [useSprayForm.ts:207](C:/projects/AcreLedger/src/hooks/useSprayForm.ts:207), [FertilizerModal.tsx:81](C:/projects/AcreLedger/src/components/FertilizerModal.tsx:81), [FieldDetailScreen.tsx:447](C:/projects/AcreLedger/src/pages/FieldDetailScreen.tsx:447).

Forms use `toISOString().split('T')[0]`, which generates a UTC date. The pattern also appears in hay, tillage, and sale forms.

**Reproduced:** September 5 at 8:30 p.m. in Chicago defaults to September 6. This can also send historical-weather recovery to the wrong day.

The field screen has the opposite display problem: parsing a date-only string with `new Date()` displays the previous day in western timezones.

**Fix:** Use the existing `toLocalIsoDate(Date.now())` and `formatIsoDate()` helpers. Add timezone tests around evening UTC rollover, year boundaries, and DST.

### M5. Field-note autosave can discard edits and overwrite unrelated field changes

**Locations:** [FieldNotes.tsx:36](C:/projects/AcreLedger/src/components/FieldNotes.tsx:36), [FieldNotes.tsx:46](C:/projects/AcreLedger/src/components/FieldNotes.tsx:46), [FieldNotes.tsx:66](C:/projects/AcreLedger/src/components/FieldNotes.tsx:66).

Navigating away during the two-second debounce cancels the save without preserving the draft. A failed save sets status to `idle`, whose effect replaces the draft with persisted notes.

The timer also submits a captured full `field` object. An intervening field edit can be overwritten when that old object is saved.

**Fix:** Preserve dirty drafts on failure/navigation, serialize note saves, and write only the notes field with version protection.

### M6. Native credentials are stored in Preferences, and database encryption silently downgrades

**Locations:** [supabase.ts:49](C:/projects/AcreLedger/src/lib/supabase.ts:49), [crypto.ts:11](C:/projects/AcreLedger/src/utils/crypto.ts:11), [offlineStorage.ts:39](C:/projects/AcreLedger/src/lib/offlineStorage.ts:39), [offlineStorage.ts:60](C:/projects/AcreLedger/src/lib/offlineStorage.ts:60).

Comments describe Preferences as Keychain storage, but the installed iOS implementation uses `UserDefaults`. Authentication sessions and encryption material therefore lack the claimed Keychain protection.

Separately, an encrypted database-open failure automatically retries with an unencrypted database.

**Fix:** Store native refresh tokens and encryption keys in platform secure storage. Replace automatic plaintext fallback with explicit failure or a controlled migration. Correct misleading storage comments.

### M7. Rainfall decoding failures become finalized zero-rain observations

**Locations:** [mrms.ts:92](C:/projects/AcreLedger/supabase/functions/shared/mrms.ts:92), [mrms.ts:109](C:/projects/AcreLedger/supabase/functions/shared/mrms.ts:109), [mrms-hourly/index.ts:68](C:/projects/AcreLedger/supabase/functions/mrms-hourly/index.ts:68).

Missing sections, PNG decoding failures, undersized buffers, and out-of-grid coordinates return numeric zero. Callers then persist those values and mark Pass 2 results finalized.

Unavailable or corrupt data becomes indistinguishable from measured dry weather and can overwrite previous observations.

**Fix:** Return explicit missing/error results and skip invalid writes. Preserve previous observations, validate coordinates, and finalize only successfully decoded measurements. Both MRMS jobs also need paginated active-field reads.

### M8. The assistant’s advertised handler deadline does not bound database work

**Locations:** [ai-assistant.ts:402](C:/projects/AcreLedger/api/ai-assistant.ts:402), [ai-assistant.ts:413](C:/projects/AcreLedger/api/ai-assistant.ts:413), [ai-assistant-tools.ts:632](C:/projects/AcreLedger/server/ai-assistant-tools.ts:632), [ai-assistant-tools.ts:685](C:/projects/AcreLedger/server/ai-assistant-tools.ts:685).

The 45-second controller reaches OpenRouter fetches but not Supabase tool queries or awaited audit finalization. Slow database work can outlive the deadline; even timeout handling awaits another unbounded finalization call.

Search and timeline tools can also page multiple complete collections. Their row limits apply separately, and the serialized result budget is enforced after fetching.

**Fix:** Propagate a shared deadline through database queries and finalization. Apply request-wide query, row, and byte budgets. Push filtering and aggregation into appropriately scoped database operations.

## Improvement recommendations

### R1. Medium — make the database reproducible from an empty instance

**Locations:** [first migration:9](C:/projects/AcreLedger/supabase/migrations/20260317100000_add_scale_ticket_number.sql:9), [migration configuration:57](C:/projects/AcreLedger/supabase/config.toml:57).

The migration chain begins by altering existing core tables; the checked-in SQL does not provide their complete initial creation. The separate historical `migrations/` directory further obscures the required baseline.

**Recommendation:** Check in a reproducible baseline and document which historical scripts are archival. Require a clean database migration run in CI, followed by grant, RLS, restore, and conflict-key tests.

### R2. Medium — test failure boundaries with realistic adapters

**Locations:** [syncQueue tests:9](C:/projects/AcreLedger/src/lib/__tests__/syncQueue.test.ts:9), [farmStore tests:35](C:/projects/AcreLedger/src/store/__tests__/farmStore.test.tsx:35).

Existing mocks conceal important behavior: encryption is mocked, and provider tests substitute loading/auth behavior. Static type checks cannot detect the migration/upsert mismatch.

**Recommendation:** Prioritize regression coverage for:

- First-use concurrent encryption and large payloads.
- Realistic PostgREST errors, zero-row updates, and lost insert responses.
- More than 1,000 records and multi-page failures.
- Delayed requests crossing sign-out or account changes.
- Two-client grain edits and partial harvest saves.
- Cross-tenant foreign keys and soft-delete resurrection.
- Reconnects during editing and local-date boundaries.

### R3. Low — reduce global rerenders and repeated collection scans

**Locations:** [farmStore.tsx:634](C:/projects/AcreLedger/src/store/farmStore.tsx:634), [generateLandlordSummary.ts:131](C:/projects/AcreLedger/src/lib/complianceReports/generateLandlordSummary.ts:131), [fsaReports.ts:1001](C:/projects/AcreLedger/src/lib/complianceReports/fsaReports.ts:1001).

A newly constructed context value exposes all collections and operations to every consumer. Report builders repeatedly filter activities or search fields inside per-field/per-record loops.

These are CPU-side repeated scans, rather than confirmed SQL N+1 queries.

**Recommendation:** Build reusable ID/grouping maps and separate state subscriptions by responsibility. Profile realistic farm sizes before larger architectural changes.

## Security assessment and repair order

The reviewed API handlers validate bearer tokens, use exact origin allowlists, and keep privileged provider keys server-side. The assistant’s database surface remains named and read-only. I found no confirmed hardcoded privileged secret in the source scan; this was not a full Git-history or deployed-bundle secret audit.

Recommended repair order:

1. Correct the FSA/CLU migration contract.
2. Repair pagination, encryption, and offline replay.
3. Add session-safe loading and transactional/versioned grain operations.
4. Address native storage, tenant-aware relationships, and rainfall error semantics.
5. Add the regression tests above before broader performance work.
