-- AcreLedger Database RLS Update Policies Hardening
-- Date: 2026-06-29

-- NOTE: The RESTRICTIVE policies below block client-side restore operations on soft-deleted rows.
-- Combined with the deleted_at IS NULL select policy, restoring a soft-deleted row
-- via UPDATE ... SET deleted_at = null by an authenticated client is blocked at two layers.
-- This is intentional defense-in-depth: all backup restores and manual record restores
-- must go through the service_role RPC interface, not direct client API updates.

-- 1. Loop through all 12 core tables and add a restrictive policy enforcing that rows
-- can only be updated if they are currently active (deleted_at IS NULL).
-- We use WITH CHECK (true) to allow updates to transition rows to a deleted state (soft delete).
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'fields', 'bins', 'plant_records', 'spray_records',
        'harvest_records', 'hay_harvest_records', 'fertilizer_applications',
        'tillage_records', 'grain_movements', 'saved_seeds',
        'fertilizer_recipes', 'spray_recipes'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Restrict updates on deleted rows" ON public.%I AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- 2. Add WITH CHECK to the profiles UPDATE policy for complete symmetry and validation
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
