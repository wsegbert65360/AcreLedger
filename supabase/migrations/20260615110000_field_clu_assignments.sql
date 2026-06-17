-- Field CLU Assignments Table
-- Junction table tracking which CLU polygons belong to which field.

CREATE TABLE IF NOT EXISTS public.field_clu_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    tract_key TEXT NOT NULL,
    clu_number TEXT NOT NULL,
    acres NUMERIC(10,2),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(field_id, tract_key, clu_number)
);

ALTER TABLE public.field_clu_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_clu_assignments_select ON public.field_clu_assignments
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY field_clu_assignments_insert ON public.field_clu_assignments
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY field_clu_assignments_update ON public.field_clu_assignments
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY field_clu_assignments_delete ON public.field_clu_assignments
    FOR DELETE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.field_clu_assignments TO authenticated;
GRANT ALL ON TABLE public.field_clu_assignments TO service_role;

COMMENT ON TABLE public.field_clu_assignments IS 'Maps CLU polygons from FSA tracts to farm fields.';
COMMENT ON COLUMN public.field_clu_assignments.tract_key IS 'References fsa_tract_imports.tract_key.';
COMMENT ON COLUMN public.field_clu_assignments.clu_number IS 'CLU number within the tract, e.g. 25.';
