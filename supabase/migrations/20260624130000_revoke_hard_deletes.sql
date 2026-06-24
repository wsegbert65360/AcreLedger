-- Revoke DELETE privileges on FSA tract and CLU assignment tables from authenticated users
-- These tables rely exclusively on soft-delete mechanisms to prevent constraint violations
-- during offline sync and backup restoration.

DROP POLICY IF EXISTS fsa_tract_imports_delete ON public.fsa_tract_imports;
DROP POLICY IF EXISTS field_clu_assignments_delete ON public.field_clu_assignments;

REVOKE DELETE ON TABLE public.fsa_tract_imports FROM authenticated;
REVOKE DELETE ON TABLE public.field_clu_assignments FROM authenticated;
