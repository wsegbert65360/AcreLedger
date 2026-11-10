# Free-tier rainfall (Phase 4)

Free farms get **daily rainfall totals** (history only) on their **2 oldest fields**. Paid farms keep hourly
collection on every field. Nothing here changes behaviour while `ENTITLEMENTS_MODE = off`.

## How it works

| Piece | What it does |
| --- | --- |
| `field_rainfall_daily` | One row per field per rain day. A rain day is the 24 hours ending **8:00 am America/Chicago**, labelled with that date. |
| `rainfall_slot_field_ids(farm)` | The 2 oldest active fields with coordinates (`created_at`, NULLs last, then id). Fixed, not user-choosable. |
| `rainfall_collectable_fields(tier, after, limit)` | Service-role only. `hourly` = all eligible fields (free-plan farms excluded only when mode = `enforce`). `daily` = slot fields of free-plan farms. Keyset-paged on `id`. |
| `get_field_rainfall_daily(field, start, end)` | Client read. When enforced, a free farm can only read its slot fields (`P0402 premium_required:rainfall`). |
| `seed_field_rainfall_daily_from_hourly()` | One-off: builds daily rows from existing finalized hourly data for slot fields (full local days only, never overwrites real daily rows). |
| `mrms-daily` Edge Function | Downloads NOAA `MultiSensor_QPE_24H_Pass2` (Pass 1 fallback), decodes the grid **once per run**, upserts every free slot field. One date per run; retries missed or provisional days from the last 3. Collects nothing while mode = `off`. Records each day in `mrms_daily_runs`. |
| `mrms-hourly` / `mrms-backfill` | Now take their field list from `rainfall_collectable_fields('hourly')`. Single-field backfill (`field_id` in the body) is unchanged. |

Checked 2026-11-08: the 24H file has the same 7000 x 3500 grid and 16-bit packing as the 01H file, so the
existing decoder is reused unchanged. 24H files are published hourly (rolling window); the job reads the one
stamped 08:00 Central.

## Cost model

The grid decode cost is per file, not per field. Free tier = 1 decode/day regardless of how many free farms
exist. Free farms are also skipped by hourly collection once mode = `enforce`, which cuts Supabase storage
growth and Edge Function time.

## Client behaviour

`isFreeTierLocked(entitlement)` is true only when the server reports `enforced` and the plan is `free`, so
nothing changes in `off` / `shadow`.

- `FieldDetailScreen`: locked farms read `RainfallDailyService.fetchRainfallFromDaily` (same `RainfallResult`
  shape, so the existing cards work). A non-slot field shows the "included with Pro" message (DRAFT copy).
- `WeatherWidget` / `Weather`: locked farms never call the Rain API; a slot field shows its daily totals, any
  other location keeps the plain weather-service numbers.

## Limits to be aware of

- The Rain API (`C:\Projects\Rain api`, Vercel Hobby) is open (no auth, IEM-based). Live-rain gating there is
  **not server-enforceable**; tiering is enforced by what we collect and by our own read RPCs, plus client display.
- Vercel Hobby terms restrict commercial use; moving the Rain API to a paid Vercel plan (or into Supabase) is a
  hand-off decision.
- Free farms' farm-level `farm_rainfall_daily` rollup (pg_cron) is built from hourly data, so it stops updating
  for free farms once hourly collection stops. Decide whether to feed it from `field_rainfall_daily`.
- Prod `fields.created_at` null counts were not checked (the read was blocked). NULLs sort last, so they only
  matter if a farm has fewer than 2 dated fields.

## Rollout (staging first; nothing below has been run)

1. Apply migration `20261107040000_rainfall_tiering.sql` to **staging**.
2. Deploy `mrms-daily`, `mrms-hourly`, `mrms-backfill` to staging.
3. Seed once: `SELECT public.seed_field_rainfall_daily_from_hourly();` (service role).
4. Schedule the daily job. Copy the `mrms-hourly-ingestion` job from
   `20260719022649_harden_mrms_scheduler_auth.sql` (same vault secrets and headers), changing the job name to
   `mrms-daily-ingestion`, the URL suffix to `/functions/v1/mrms-daily`, and the schedule to
   `30 16,22 * * *` (UTC). The 16:30 run (11:30 am CDT / 10:30 am CST) is after the 8 am Central reading plus
   the 2 hour publish lag in both time zones. The function handles **one date per run** (decoding is heavy):
   the first run takes the newest day; the 22:30 run finds it final and retries the oldest of the last 3 days
   that is missing or only provisional (Pass 1). A day counts as done only with Pass 2 data.
5. Check `mrms_daily_runs` the next morning, then flip the staging mode to `shadow`, then `enforce`.
