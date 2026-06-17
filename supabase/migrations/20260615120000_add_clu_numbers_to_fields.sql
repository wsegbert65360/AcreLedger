-- Add CLU numbers column to fields table
-- Stores denormalized CLU assignments for quick lookup in FieldBoundaryMap.

ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS clu_numbers JSONB;

COMMENT ON COLUMN public.fields.clu_numbers IS 'Denormalized array of assigned CLU numbers, e.g. ["11", "14", "51"].';
