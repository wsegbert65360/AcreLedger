-- Add field_name to fertilizer_applications
-- Date: 2026-03-23

ALTER TABLE public.fertilizer_applications 
ADD COLUMN IF NOT EXISTS field_name text;

-- Update existing records if any
UPDATE public.fertilizer_applications f
SET field_name = (SELECT name FROM public.fields WHERE id = f.field_id)
WHERE field_name IS NULL;
