-- Repair saved_seeds table and align spray_records expectations
-- Date: 2026-03-23

-- 1. Fix saved_seeds table
ALTER TABLE public.saved_seeds 
ADD COLUMN IF NOT EXISTS crop text,
ADD COLUMN IF NOT EXISTS variety text,
ADD COLUMN IF NOT EXISTS supplier text,
ADD COLUMN IF NOT EXISTS lot_number text,
ADD COLUMN IF NOT EXISTS year integer,
ADD COLUMN IF NOT EXISTS notes text;

-- 2. Note on spray_records: 
-- The columns treated_area_size and total_amount_applied are already 'text' 
-- in the provided schema. We will stick with that to avoid data loss 
-- and handle conversion in the application mapper.
