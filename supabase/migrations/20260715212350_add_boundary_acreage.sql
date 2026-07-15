-- Preserve field boundary acreage independently from FSA CLU assignments.
--
-- The existing operational_acreage column was seeded from fields.acreage and
-- has never been used by the client. It is now the durable boundary/manual
-- acreage value (exposed in the app as Field.boundaryAcreage). Reusing it avoids
-- adding a second overlapping column and preserves any value already captured.
--
-- Only repair an empty value when the field has no active CLU assignments, so
-- fields whose acreage may already have been replaced by an assignment total
-- are never guessed or rewritten. No activity, spray, weather, or report rows
-- are touched by this migration.

COMMENT ON COLUMN public.fields.operational_acreage IS
  'Stable field boundary/manual acreage. Legacy database name; exposed by the client as boundaryAcreage. Never overwritten by CLU assignment sync.';

UPDATE public.fields AS f
SET operational_acreage = f.acreage
WHERE f.operational_acreage = 0
  AND f.acreage > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.field_clu_assignments AS a
    WHERE a.field_id = f.id
      AND a.farm_id = f.farm_id
      AND a.deleted_at IS NULL
  );
