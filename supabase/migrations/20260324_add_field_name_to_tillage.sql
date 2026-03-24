-- Add field_name to tillage_records
-- Date: 2026-03-24

ALTER TABLE public.tillage_records 
ADD COLUMN IF NOT EXISTS field_name text;

-- Update existing records if any
UPDATE public.tillage_records t
SET field_name = (SELECT name FROM public.fields WHERE id = t.field_id)
WHERE field_name IS NULL;
