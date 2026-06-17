-- Correct the initial FSA tract persistence constraints and policies.
-- The preceding migrations were already applied before these fixes were identified.

DROP INDEX IF EXISTS public.fsa_tract_imports_farm_tract_key;

ALTER TABLE public.fsa_tract_imports
    ADD CONSTRAINT fsa_tract_imports_farm_id_tract_key_key
    UNIQUE (farm_id, tract_key);

ALTER TABLE public.field_clu_assignments
    DROP CONSTRAINT IF EXISTS field_clu_assignments_field_id_tract_key_clu_number_key;

ALTER TABLE public.field_clu_assignments
    ADD CONSTRAINT field_clu_assignments_farm_id_tract_key_clu_number_key
    UNIQUE (farm_id, tract_key, clu_number);

DROP POLICY IF EXISTS fsa_tract_imports_update ON public.fsa_tract_imports;
CREATE POLICY fsa_tract_imports_update ON public.fsa_tract_imports
    FOR UPDATE TO authenticated
    USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS field_clu_assignments_insert ON public.field_clu_assignments;
CREATE POLICY field_clu_assignments_insert ON public.field_clu_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.fields
            WHERE fields.id = field_id
              AND fields.farm_id = field_clu_assignments.farm_id
              AND fields.deleted_at IS NULL
        )
    );

DROP POLICY IF EXISTS field_clu_assignments_update ON public.field_clu_assignments;
CREATE POLICY field_clu_assignments_update ON public.field_clu_assignments
    FOR UPDATE TO authenticated
    USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.fields
            WHERE fields.id = field_id
              AND fields.farm_id = field_clu_assignments.farm_id
              AND fields.deleted_at IS NULL
        )
    );

CREATE OR REPLACE FUNCTION public.soft_delete_fsa_tract(
    p_tract_id UUID,
    p_farm_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_tract_key TEXT;
    v_deleted_at TIMESTAMPTZ := now();
BEGIN
    SELECT tract_key
    INTO v_tract_key
    FROM public.fsa_tract_imports
    WHERE id = p_tract_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL;

    IF v_tract_key IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.field_clu_assignments
    SET deleted_at = v_deleted_at
    WHERE farm_id = p_farm_id
      AND tract_key = v_tract_key
      AND deleted_at IS NULL;

    UPDATE public.fsa_tract_imports
    SET deleted_at = v_deleted_at
    WHERE id = p_tract_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_fsa_tract(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_fsa_tract(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_fsa_tract(UUID, UUID) TO service_role;
