-- Restore soft-delete parity for FSA tract and CLU records.

-- Keep the full unique constraints used by import, reassignment, offline replay,
-- and backup restore. These reference tables intentionally resurrect tombstones
-- through ON CONFLICT rather than creating another historical row.

DROP POLICY IF EXISTS fsa_tract_imports_select ON public.fsa_tract_imports;
CREATE POLICY fsa_tract_imports_select ON public.fsa_tract_imports
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS field_clu_assignments_select ON public.field_clu_assignments;
CREATE POLICY field_clu_assignments_select ON public.field_clu_assignments
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.custom_spray_records;
CREATE POLICY "Restrict updates on deleted rows" ON public.custom_spray_records
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.work_requests;
CREATE POLICY "Restrict updates on deleted rows" ON public.work_requests
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

-- FSA tract and CLU assignment tombstones remain update-visible within the
-- caller's farm so their sanctioned conflict-key upserts can resurrect them.
DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.fsa_tract_imports;
DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.field_clu_assignments;
