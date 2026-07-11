BEGIN;

ALTER TABLE IF EXISTS public.custom_spray_records
    ADD COLUMN IF NOT EXISTS application_time TIME;

COMMENT ON COLUMN public.custom_spray_records.application_time IS
    'Local application time used to recover historical weather conditions.';

COMMIT;
