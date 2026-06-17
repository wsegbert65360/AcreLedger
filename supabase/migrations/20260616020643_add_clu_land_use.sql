ALTER TABLE public.field_clu_assignments
    ADD COLUMN IF NOT EXISTS land_use TEXT NOT NULL DEFAULT 'cropland';

ALTER TABLE public.field_clu_assignments
    DROP CONSTRAINT IF EXISTS field_clu_assignments_land_use_check;

ALTER TABLE public.field_clu_assignments
    ADD CONSTRAINT field_clu_assignments_land_use_check
    CHECK (land_use IN ('cropland', 'non_cropland'));

COMMENT ON COLUMN public.field_clu_assignments.land_use IS
    'FSA acreage classification for the assigned CLU: cropland or non_cropland.';
