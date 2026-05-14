-- Revoke EXECUTE on rollup function from authenticated role.
-- Only pg_cron (superuser) should invoke daily rollup jobs.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.rollup_all_farms_daily(date) FROM authenticated;
COMMIT;
