-- Backfill fertilizer_applications.acres to FSA crop acreage
-- Date: 2026-07-15
--
-- Fertilizer applied acreage should reflect the field's FSA crop acreage (the same
-- value getDisplayFieldAcres produces in the app), not the raw field boundary
-- acreage that was snapshotted as a pre-fill default before 2026-07-15. This
-- one-time backfill re-derives every active fertilizer record's acres from the
-- field's current CLU cropland assignments, falling back to the raw field acreage
-- when no CLUs are assigned.
--
-- Reproduces src/lib/fieldAcreage.ts getDisplayFieldAcres exactly:
--   - >= 1 active CLU assignment  -> sum of active 'cropland' acres (0 if all non-cropland)
--   - 0 active CLU assignments    -> field.acreage fallback
--   - field missing               -> leave NULL (nothing to derive from)
--
-- Scoped to active records (deleted_at IS NULL); soft-deleted rows are left alone.
-- Deterministic and safe to re-run. Overwrites all prior acres values on active
-- records, including deliberate partial-field spot-application entries.

UPDATE public.fertilizer_applications AS f
SET acres = (
    CASE
        -- Field has at least one active CLU assignment: sum cropland acres only.
        -- Matches calculateFieldCroplandAcres (0 when all assignments are non-cropland).
        WHEN EXISTS (
            SELECT 1
            FROM public.field_clu_assignments a
            WHERE a.field_id = f.field_id
              AND a.deleted_at IS NULL
        ) THEN COALESCE((
            SELECT round(sum(a.acres)::numeric, 2)
            FROM public.field_clu_assignments a
            WHERE a.field_id = f.field_id
              AND a.deleted_at IS NULL
              AND a.land_use = 'cropland'
        ), 0)
        -- No active CLU assignments: fall back to the field's stored acreage.
        ELSE COALESCE((
            SELECT fl.acreage
            FROM public.fields fl
            WHERE fl.id = f.field_id
        ), NULL)
    END
)
WHERE f.deleted_at IS NULL
  AND f.field_id IS NOT NULL;
