-- SUPERSEDED for existing projects by 20261017041928_apply_missing_safeguards.sql. Never applied in production (audit 2026-10-17). Do not db push this out-of-order file to prod; after applying the consolidated migration, mark this version applied with supabase migration repair --status applied 20260825213000. Kept unchanged for fresh replay (supabase db reset / verify:migrations); the consolidated migration is idempotent so it is a no-op after this file runs.
--
-- One active grain movement per harvest link.
--
-- HarvestModal / addGrainMovement can re-link a leftover IN after a failed
-- bin→town unlink. Without a uniqueness guard, a stale local snapshot that
-- misses that leftover would insert a second active IN and double bin inventory.
-- Soft-deleted rows may retain harvest_record_id; only active rows are unique.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.grain_movements
    WHERE harvest_record_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY harvest_record_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create unique active harvest_record_id index: duplicate active grain_movements exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_grain_movements_one_active_per_harvest
  ON public.grain_movements (harvest_record_id)
  WHERE harvest_record_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_grain_movements_one_active_per_harvest IS
  'At most one non-deleted grain_movements row may reference a given harvest_record_id (prevents double-count IN rows).';
