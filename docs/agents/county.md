# Physical county identification

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-19, working tree (uncommitted). Files opened: src/lib/county/*, src/store/useCountyAssignments.ts, src/lib/syncQueue.ts, src/lib/complianceReports/fsaReports.ts, supabase/migrations/20261119202950_county_assignments.sql.

<!-- contents:start -->
- [What a county is here](#what-a-county-is-here)
- [Data](#data)
- [Calculation](#calculation)
- [Allocation and reports](#allocation-and-reports)
- [Manual corrections and review](#manual-corrections-and-review)
- [Sync and offline](#sync-and-offline)
- [Loading boundaries](#loading-boundaries)
- [Backfill](#backfill)
- [Production boundary coverage (follow-up when other farms join)](#production-boundary-coverage-follow-up-when-other-farms-join)
<!-- contents:end -->

## What a county is here

The county where land physically lies, from its boundary geometry. It is not the county of the administering FSA office, and it is never read from field names or notes. Notes ("about 10 ac Benton, 45 ac Henry") are a review reference only: they are compared and differences are shown, but they never create or change an assignment.

## Data

- `county_boundaries` (global, read-only to clients): Census TIGER/Line counties with FIPS, name, state, dataset source and version. Loaded by `scripts/county/build-county-boundaries.mjs`, which writes SQL and never connects to a database. Clients read the current version through `get_county_boundaries(bbox)`.
- `county_assignments` (farm-owned, soft-delete): one row per subject (`field` or `clu`) per county, plus one `unresolved` marker when geometry is missing or unusable. Live rows are unique per `(farm_id, subject_type, subject_key, county_fips)`. CLU keys are `tractKey:cluNumber` and are always scoped by `farm_id`.
- Mapped acres (`mapped_acres`, geodesic) are kept apart from recorded acres (the field or CLU acreage). `manual_acres` exists only on manual rows. Each row records `method` (`geometry`, `centroid`, `manual`, `unresolved`), `review_status` (`ok`, `needs_review`, `reviewed`), `geometry_hash`, dataset source/version and `calculated_at`.
- A point (field lat/lng) is only provisional: method `centroid`, always needs review. A polygon always wins over a point.

## Calculation

- Pure code in `src/lib/county/`: `geometry.ts` (normalize, repair, geodesic area, hashing), `calculate.ts`, `allocation.ts`, `resolve.ts`, `plan.ts`. Areas come from turf geodesic area, never from degrees.
- `planCountyAssignments` is the only planner. Backfill preview, apply and automatic sync all use it, so a preview shows exactly what applying does. Plans are repeatable: ids come from the prior live row or a new UUID, so running twice creates no duplicates.
- Modes: `sync` acts only on new or geometry-changed subjects; `recalculate` also re-measures unchanged ones (used after a dataset update).
- Unusable geometry is marked unresolved. When boundary data is not on the device the planner defers and writes nothing; "no county found" is never confused with "not downloaded".

## Allocation and reports

- A field's counties follow this order: manual correction, the field's own boundary, the CLUs assigned to it (each by its own geometry, weighted by assigned acres), a provisional point, then County unknown. A tract's split is never applied to a field as a whole.
- Production is allocated per county by mapped share and marked estimated whenever a field spans counties, because no schema field records production per county. Largest-remainder rounding makes the parts add back to the record exactly. Do not change this without adding a county-specific production source.
- Every report reads counties through `buildCountyReportContext` (saved rows only, no geometry work, no network). `buildInsuranceProductionReport` (enterprise unit = crop + county) and the FSA-578 box 5 county take the context; with none, county is unknown. County unknown is its own unit and is included in every total.
- Estimated rows are labeled on screen, CSV and PDF. The report fingerprint covers the allocated rows, so a change to counties marks an earlier export as changed.
- Historical reports are not silently recalculated. Counties change only when the geometry changes, or when the farmer applies a recalculation.

## Manual corrections and review

- A manual split must add up to the recorded acreage (`validateManualSplit`) and survives recalculation. If the geometry changes afterwards the correction is kept and flagged needs review; it is never replaced.
- "Restore automatic" retires the manual rows and recalculates that subject. "Mark reviewed" records the acknowledgement against the current geometry.
- A mapped-vs-recorded difference over max(0.5 ac, 5%) is flagged for review.

## Sync and offline

- `county_assignments` is in the sync queue allowlist. Writes are one atomic `enqueueMutations` batch ordered retire, update, insert, for online and offline use alike.
- Retiring a row calls `soft_delete_county_assignment`, because the SELECT policy hides deleted rows and a direct `deleted_at` UPDATE fails RLS. The RPC is idempotent and farm-checked.
- An insert that hits the live unique index drops an automatic row (it is recomputable) and applies a manual row onto the live one.
- Rows are cached with the other farm tables. Boundaries are cached per device in 0.25-degree cells; a cell is covered only after a complete download, and a full RPC page counts as incomplete.
- The table is read fail-soft: if the migration is not applied the rest of the farm still loads.

## Loading boundaries

1. Download `tl_2025_us_county.zip` from the Census TIGER/Line site and convert it to GeoJSON.
2. `npm run county:boundaries -- --input counties.geojson --version tiger-2025 --source "US Census Bureau TIGER/Line 2025 (tl_2025_us_county)" --out counties.sql [--states 29,19]`
3. Review the SQL and run it against staging, then production. It loads as not-current and switches the current version in one transaction.
4. After a dataset update, run the full recalculation preview in Settings → Counties.

Coordinates are NAD83 as published; they are used as WGS84 (about 1 m difference). Simplification tolerance is 0.00003 degrees (about 3 m).

## Backfill

Existing farms are not filled in automatically. Settings → Counties → Preview shows each subject's action and result, the notes differences and the counts. Apply saves exactly that plan. After the first apply, new and changed fields and CLUs keep themselves current. A farm that never ran the backfill has no county rows, and its fall report lists County unknown.

## Production boundary coverage (follow-up when other farms join)

Production (FarmFlow2) was loaded on 2026-11-19 with only Henry (29083) and Benton (29015), MO, dataset `tiger-2025`, because that covers the first farm. A field in any other county resolves as County unknown, never a guess. When another farm joins, load the counties it operates in, then run that farm's Settings → Counties → Preview → Apply. For counties outside the loaded set, run `county:boundaries` with `--states` or the full file. Loading a county that is already current needs a new `--version`, so the switch stays in one transaction.
