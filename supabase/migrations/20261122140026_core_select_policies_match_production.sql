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
-- This sets the policy to the unfiltered form in place (ALTER POLICY, so
-- there is no moment without a policy), or creates it if a table lacks it.
-- On production it is a no-op for any table that already matches. Active-row
-- filtering stays in the client (`.is('deleted_at', null)`), and "Restrict
-- updates on deleted rows" still blocks edits to deleted rows. Tables whose
-- SELECT policy keeps the filter retire rows through definer RPCs
-- (soft_delete_farm_rows and friends).

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
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'Users can select their farm data'
    ) THEN
      EXECUTE format('ALTER POLICY "Users can select their farm data" ON public.%I
        TO authenticated
        USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))', t);
    ELSE
      EXECUTE format('CREATE POLICY "Users can select their farm data" ON public.%I
        FOR SELECT
        TO authenticated
        USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))', t);
    END IF;
  END LOOP;
END $$;
