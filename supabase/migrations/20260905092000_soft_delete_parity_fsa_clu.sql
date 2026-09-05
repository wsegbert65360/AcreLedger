-- Restore soft-delete parity for FSA tract and CLU records.

ALTER TABLE public.fsa_tract_imports
    DROP CONSTRAINT IF EXISTS fsa_tract_imports_farm_id_tract_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS fsa_tract_imports_farm_tract_key
    ON public.fsa_tract_imports(farm_id, tract_key) WHERE deleted_at IS NULL;

ALTER TABLE public.field_clu_assignments
    DROP CONSTRAINT IF EXISTS field_clu_assignments_farm_id_tract_key_clu_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS field_clu_assignments_farm_id_tract_key_clu_number_key
    ON public.field_clu_assignments(farm_id, tract_key, clu_number) WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS fsa_tract_imports_select ON public.fsa_tract_imports;
CREATE POLICY fsa_tract_imports_select ON public.fsa_tract_imports
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS field_clu_assignments_select ON public.field_clu_assignments;
CREATE POLICY field_clu_assignments_select ON public.field_clu_assignments
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.custom_spray_records;
CREATE POLICY "Restrict updates on deleted rows" ON public.custom_spray_records
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.work_requests;
CREATE POLICY "Restrict updates on deleted rows" ON public.work_requests
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.fsa_tract_imports;
CREATE POLICY "Restrict updates on deleted rows" ON public.fsa_tract_imports
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.field_clu_assignments;
CREATE POLICY "Restrict updates on deleted rows" ON public.field_clu_assignments
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);