-- ============================================================
-- ACRELEDGER MIGRATION: 20260401_grain_movements_type_check.sql
-- Purpose: Add CHECK constraint to grain_movements.type
--          to enforce 'in' | 'out' at DB level
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grain_movements_type_check'
  ) THEN
    -- Sanitize existing data first: nullify invalid values
    UPDATE public.grain_movements
    SET type = NULL
    WHERE type IS NOT NULL AND type NOT IN ('in', 'out');

    ALTER TABLE public.grain_movements
      ADD CONSTRAINT grain_movements_type_check
      CHECK (type IN ('in', 'out'));
    RAISE NOTICE 'Added CHECK constraint on grain_movements.type';
  ELSE
    RAISE NOTICE 'Constraint already exists — skipped';
  END IF;
END $$;
