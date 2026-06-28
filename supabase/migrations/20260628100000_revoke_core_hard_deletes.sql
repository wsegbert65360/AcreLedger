-- Revoke hard-delete access for core farm-owned tables.
-- AcreLedger uses soft deletes (`deleted_at`) for user farm records; authenticated
-- clients should not be able to hard-delete rows through the Data API.

DO $$
DECLARE
    t text;
    farm_scoped_tables text[] := ARRAY[
        'fields',
        'bins',
        'plant_records',
        'spray_records',
        'harvest_records',
        'hay_harvest_records',
        'fertilizer_applications',
        'tillage_records',
        'grain_movements',
        'saved_seeds',
        'fertilizer_recipes',
        'spray_recipes'
    ];
BEGIN
    FOREACH t IN ARRAY farm_scoped_tables LOOP
        EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM authenticated', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', t);

        EXECUTE format('DROP POLICY IF EXISTS "Users can access their farm data" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can select their farm data" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert their farm data" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can update their farm data" ON public.%I', t);

        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO service_role', t);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);

        EXECUTE format('CREATE POLICY "Users can select their farm data" ON public.%I
            FOR SELECT
            TO authenticated
            USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()) AND deleted_at IS NULL)', t);

        EXECUTE format('CREATE POLICY "Users can insert their farm data" ON public.%I
            FOR INSERT
            TO authenticated
            WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))', t);

        EXECUTE format('CREATE POLICY "Users can update their farm data" ON public.%I
            FOR UPDATE
            TO authenticated
            USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))
            WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))', t);

        EXECUTE format('DROP POLICY IF EXISTS "Users can manage their own fertilizer recipes" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can manage their own tillage records" ON public.%I', t);
    END LOOP;
END $$;
