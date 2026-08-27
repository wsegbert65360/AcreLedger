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
