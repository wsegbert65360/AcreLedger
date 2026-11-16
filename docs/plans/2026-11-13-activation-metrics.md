# Activation metrics from existing data

Plan only. No code in this change.

## Goal

Per farm: first field added, first activity record, first report export. Prefer rows the app already stores. Do not add a third-party analytics SDK.

## What already exists

- Fields: `public.fields.created_at` (some production rows may have a null `created_at`; the field-cap code orders by `created_at`, then `id`).
- First activity: the earliest `timestamp` or work date among non-deleted plant, spray, custom spray, fertilizer, tillage, harvest, hay, and grain rows for that `farm_id`. Grain is season-stamped but the first event is still one timestamp.
- Report export: `src/lib/reportExportHistory.ts` stores fingerprints in local storage on the device. There is no server table of exports. A first-export metric is not available from existing database rows.

## Files if this is built later

- Owner-only SQL or a read-only script under `scripts/` for field and activity timestamps. No client write path.
- A new table only if export time must be known. That table would be farm-owned, soft-deleted, and covered by `scripts/farm-table-migration-guard.mjs` and `scripts/recovery/tenant-registry.ts`.
- `src/pages/Privacy.tsx` if a new export log or any off-device metric is added. Counting rows the farmer already stored, for the owner, does not by itself add a processor. Sending those counts to a new vendor does.

## Privacy

The privacy policy (10 Nov 2026) says farm records are used to run AcreLedger, are not sold, and are not used for ads. An owner query over existing tables matches that. A product analytics vendor, user-level export, or a metric that leaves Supabase needs a policy edit first. Do not log field names or coordinates into a metrics tool. Vercel Web Analytics already counts site page views without user ids; do not extend it with farm data.

## Risks

- Null `created_at` under-counts "fields added" if the query drops those rows.
- Soft-deleted rows are still an activation if the farmer did the work. Decide before writing the query, and do not hard-delete anything to clean the metric.
- Report-export history is per device. Treating a missing server row as "never exported" would be wrong.

## Size

Small for a read-only owner query of fields and first activity. An export event is a new table, a client write, backup/recovery classification, and a privacy review.
