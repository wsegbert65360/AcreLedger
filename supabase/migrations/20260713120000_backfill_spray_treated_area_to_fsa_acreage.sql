-- Backfill spray_records.treated_area_size to FSA crop acreage
-- Date: 2026-07-13
--
-- Spray treated area should reflect the field's FSA crop acreage (the same value
-- getDisplayFieldAcres produces in the app), not the raw field boundary acreage
-- that was snapshotted as a pre-fill default before 2026-07-13. This one-time
-- backfill re-derives every active spray record's treated area from the field's
-- current CLU cropland assignments, falling back to the raw field acreage when no
-- CLUs are assigned.
--
-- Reproduces src/lib/fieldAcreage.ts getDisplayFieldAcres exactly:
--   - >= 1 active CLU assignment  -> sum of active 'cropland' acres (0 if all non-cropland)
--   - 0 active CLU assignments    -> field.acreage fallback
--   - field missing/deleted       -> leave NULL (nothing to derive from)
--
-- Scoped to active records (deleted_at IS NULL); soft-deleted rows are left alone.
-- Deterministic and safe to re-run. Overwrites all prior treated_area_size values
-- on active records, including deliberate partial-field spot-spray entries.

UPDATE public.spray_records AS s
SET treated_area_size = (
    CASE
        -- Field has at least one active CLU assignment: sum cropland acres only.
        -- Matches calculateFieldCroplandAcres (0 when all assignments are non-cropland).
        WHEN EXISTS (
            SELECT 1
            FROM public.field_clu_assignments a
            WHERE a.field_id = s.field_id
              AND a.deleted_at IS NULL
        ) THEN COALESCE((
            SELECT round(sum(a.acres)::numeric, 2)
            FROM public.field_clu_assignments a
            WHERE a.field_id = s.field_id
              AND a.deleted_at IS NULL
              AND a.land_use = 'cropland'
        ), 0)
        -- No active CLU assignments: fall back to the field's stored acreage.
        ELSE COALESCE((
            SELECT f.acreage
            FROM public.fields f
            WHERE f.id = s.field_id
        ), NULL)
    END
)
WHERE s.deleted_at IS NULL
  AND s.field_id IS NOT NULL;
