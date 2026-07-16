-- Reject invalid CLU assignment acreage without rewriting existing records.
-- The preflight exception makes the migration fail closed if any historical
-- row needs manual review instead of silently changing or deleting it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.field_clu_assignments
    WHERE acres IS NULL OR acres <= 0
  ) THEN
    RAISE EXCEPTION 'Cannot enforce positive CLU acreage: invalid rows require review.';
  END IF;
END;
$$;

ALTER TABLE public.field_clu_assignments
  ALTER COLUMN acres SET NOT NULL;

ALTER TABLE public.field_clu_assignments
  ADD CONSTRAINT field_clu_assignments_acres_positive
  CHECK (acres > 0);
