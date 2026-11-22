-- Make the core farm tables' SELECT policy match production.
--
-- 20260628100000 created "Users can select their farm data" with
-- `AND deleted_at IS NULL`. Production's policy has no deleted_at filter
-- (checked 2026-11-21 on fields, bins and plant_records), which is why
-- client soft deletes work there: Postgres checks the new row of an UPDATE
-- against the SELECT policy, so with the filter a `SET deleted_at = now()`
-- fails RLS (42501). A database rebuilt from these migrations (disaster
-- recovery, PGlite tests) therefore could not delete a field or bin.
--
-- This recreates the policy without the filter. On production it is a no-op
-- for any table that already matches; for any that still has the filter it
-- fixes soft deletes. Active-row filtering stays in the client
-- (`.is('deleted_at', null)`), and "Restrict updates on deleted rows" still
-- blocks edits to deleted rows. Tables whose SELECT policy keeps the filter
-- retire rows through definer RPCs (soft_delete_farm_rows and friends).

DO $$
DECLARE
  t text;
  core_tables text[] := ARRAY[
    'fields', 'bins', 'plant_records', 'spray_records', 'harvest_records',
    'hay_harvest_records', 'fertilizer_applications', 'tillage_records',
    'grain_movements', 'saved_seeds', 'fertilizer_recipes', 'spray_recipes'
  ];
BEGIN
  FOREACH t IN ARRAY core_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can select their farm data" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Users can select their farm data" ON public.%I
      FOR SELECT
      TO authenticated
      USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))', t);
  END LOOP;
END $$;
