-- Rollback for 20261119202950_county_assignments.sql. Run only with owner approval: it deletes
-- every saved county assignment (manual corrections included). County rows are derived data except
-- for manual corrections; export them first if those matter.
BEGIN;
DROP TABLE IF EXISTS public.county_assignments;
DROP FUNCTION IF EXISTS public.county_assignments_touch();
DROP FUNCTION IF EXISTS public.soft_delete_county_assignment(uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.get_county_boundaries(double precision, double precision, double precision, double precision);
DROP TABLE IF EXISTS public.county_boundaries;
-- get_offline_sync_row_state keeps its allowlist entry for county_assignments; the table no longer
-- exists so the entry is inert. Re-apply 20261114130000 to restore the previous definition.
COMMIT;
