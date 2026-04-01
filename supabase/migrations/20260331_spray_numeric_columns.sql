-- Fix treated_area_size and total_amount_applied column types
-- Date: 2026-03-31
-- These columns were originally 'text' but the application expects 'numeric'.
-- Previously, non-numeric text values silently became 0 via safeNum().
-- This migration converts them to numeric with proper handling of edge cases.

-- Convert treated_area_size from text to numeric
-- Empty strings and non-numeric values become NULL (handled by app as 0).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'spray_records' 
    AND column_name = 'treated_area_size' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE public.spray_records 
      ALTER COLUMN treated_area_size TYPE numeric 
      USING CASE 
        WHEN treated_area_size IS NULL OR treated_area_size = '' THEN NULL
        WHEN treated_area_size ~ '^[0-9]+(\.[0-9]+)?$' THEN treated_area_size::numeric
        ELSE NULL  -- non-numeric values → NULL (invalid data, safer than failing)
      END;
  END IF;
END $$;

-- Convert total_amount_applied from text to numeric
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'spray_records' 
    AND column_name = 'total_amount_applied' 
    AND data_type = 'text'
  ) THEN
    ALTER TABLE public.spray_records 
      ALTER COLUMN total_amount_applied TYPE numeric 
      USING CASE 
        WHEN total_amount_applied IS NULL OR total_amount_applied = '' THEN NULL
        WHEN total_amount_applied ~ '^[0-9]+(\.[0-9]+)?$' THEN total_amount_applied::numeric
        ELSE NULL
      END;
  END IF;
END $$;

COMMENT ON COLUMN public.spray_records.treated_area_size IS 'Numeric area treated (e.g., acres). Converted from text on 2026-03-31.';
COMMENT ON COLUMN public.spray_records.total_amount_applied IS 'Numeric total product amount. Converted from text on 2026-03-31.';
