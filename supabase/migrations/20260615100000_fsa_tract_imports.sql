-- FSA Tract Imports Table
-- Stores imported FSA CLU tract GeoJSON data for farm boundary mapping.

CREATE TABLE IF NOT EXISTS public.fsa_tract_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    tract_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    feature_count INT NOT NULL DEFAULT 0,
    geojson JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS fsa_tract_imports_farm_tract_key
    ON public.fsa_tract_imports(farm_id, tract_key) WHERE deleted_at IS NULL;

ALTER TABLE public.fsa_tract_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY fsa_tract_imports_select ON public.fsa_tract_imports
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY fsa_tract_imports_insert ON public.fsa_tract_imports
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY fsa_tract_imports_update ON public.fsa_tract_imports
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY fsa_tract_imports_delete ON public.fsa_tract_imports
    FOR DELETE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fsa_tract_imports TO authenticated;
GRANT ALL ON TABLE public.fsa_tract_imports TO service_role;

COMMENT ON TABLE public.fsa_tract_imports IS 'Imported FSA CLU tract boundary GeoJSON data.';
COMMENT ON COLUMN public.fsa_tract_imports.tract_key IS 'Farm number + tract number, e.g. 6418-1417.';
COMMENT ON COLUMN public.fsa_tract_imports.geojson IS 'Full GeoJSON FeatureCollection with CLU polygon data.';
