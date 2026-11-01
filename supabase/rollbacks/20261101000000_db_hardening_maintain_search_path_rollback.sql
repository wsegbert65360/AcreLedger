-- Intentionally restore only the observed authenticated MAINTAIN grants.
-- Does not restore PUBLIC/anon grants or unsafe default privileges.
DO $rollback$
DECLARE table_name text;
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'bins', 'farm_rainfall_daily', 'farm_subscriptions', 'farms',
      'fertilizer_applications', 'fertilizer_recipes', 'field_clu_assignments',
      'field_rainfall_coverage', 'field_rainfall_hourly', 'fields',
      'fsa_tract_imports', 'grain_movements', 'harvest_records', 'hay_harvest_records',
      'plant_records', 'profiles', 'rainfall_settings', 'saved_seeds',
      'spray_recipes', 'spray_records', 'tillage_records', 'todos'
    ] LOOP
      IF pg_catalog.to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
        EXECUTE format('GRANT MAINTAIN ON TABLE public.%I TO authenticated', table_name);
      END IF;
    END LOOP;
  END IF;
  IF pg_catalog.to_regprocedure('acreage_backfill_private.historical_backfills_retired()') IS NOT NULL THEN
    ALTER FUNCTION acreage_backfill_private.historical_backfills_retired() RESET search_path;
  END IF;
END
$rollback$;
