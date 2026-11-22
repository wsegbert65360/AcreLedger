-- Review 2026-11-21 #36: season upper limits used the UTC year, so a farm
-- east of UTC (Australia) was refused next season's year for up to 14 hours
-- after its local New Year. Every limit now uses the year at UTC+14, the
-- earliest time zone. The lower bounds are unchanged.

CREATE OR REPLACE FUNCTION public._season_year_ceiling()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXTRACT(YEAR FROM (pg_catalog.now() AT TIME ZONE 'Etc/GMT-14'))::integer + 1
$$;

COMMENT ON FUNCTION public._season_year_ceiling() IS
  'Highest allowed season: next year in the earliest time zone (UTC+14).';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_active_season_valid,
  ADD CONSTRAINT profiles_active_season_valid CHECK (
    active_season IS NULL
    OR (active_season >= 2000 AND active_season <= public._season_year_ceiling())
  ) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_active_season_valid;

ALTER TABLE public.work_requests
  DROP CONSTRAINT IF EXISTS work_requests_crop_year_range,
  ADD CONSTRAINT work_requests_crop_year_range CHECK (
    crop_year >= 2000 AND crop_year <= public._season_year_ceiling()
  ) NOT VALID;
ALTER TABLE public.work_requests VALIDATE CONSTRAINT work_requests_crop_year_range;

-- Swap the UTC ceiling in the two RPCs in place, so their bodies stay exactly
-- as deployed apart from this expression.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_fn regprocedure;
BEGIN
  v_fn := 'public._restore_farm_backup_impl(jsonb, integer)'::regprocedure;
  v_def := pg_catalog.pg_get_functiondef(v_fn);
  v_new := replace(v_def, 'EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1', 'public._season_year_ceiling()');
  IF v_new = v_def THEN
    RAISE EXCEPTION '_restore_farm_backup_impl: UTC season ceiling not found';
  END IF;
  EXECUTE v_new;

  v_fn := 'public.start_pre_season_reset(integer, integer)'::regprocedure;
  v_def := pg_catalog.pg_get_functiondef(v_fn);
  v_new := replace(v_def, 'p_to_season > v_year + 1', 'p_to_season > public._season_year_ceiling()');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'start_pre_season_reset: UTC season ceiling not found';
  END IF;
  EXECUTE v_new;
END;
$$;
