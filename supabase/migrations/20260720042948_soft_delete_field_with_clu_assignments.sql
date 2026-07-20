-- Ensure every field soft-delete path (including offline queue replay, which
-- issues a direct table update) cascades active CLU assignments in the same
-- transaction. BEFORE UPDATE is required because the assignment RLS policy
-- checks that the owning field is still active.
CREATE OR REPLACE FUNCTION public.cascade_field_soft_delete_to_clu_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.field_clu_assignments
        SET deleted_at = NEW.deleted_at
        WHERE field_id = OLD.id
          AND farm_id = OLD.farm_id
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fields_cascade_soft_delete_to_clu_assignments ON public.fields;
CREATE TRIGGER fields_cascade_soft_delete_to_clu_assignments
    BEFORE UPDATE OF deleted_at ON public.fields
    FOR EACH ROW
    EXECUTE FUNCTION public.cascade_field_soft_delete_to_clu_assignments();

REVOKE ALL ON FUNCTION public.cascade_field_soft_delete_to_clu_assignments() FROM PUBLIC;

-- Client-facing atomic delete. SECURITY INVOKER preserves the existing RLS
-- ownership checks; the trigger above performs the assignment cascade.
CREATE OR REPLACE FUNCTION public.soft_delete_field_with_clu_assignments(
    p_field_id UUID,
    p_farm_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_deleted_at TIMESTAMPTZ := now();
    v_field_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.fields
        WHERE id = p_field_id
          AND farm_id = p_farm_id
          AND deleted_at IS NULL
    )
    INTO v_field_exists;

    IF NOT v_field_exists THEN
        RETURN FALSE;
    END IF;

    UPDATE public.fields
    SET deleted_at = v_deleted_at
    WHERE id = p_field_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_field_with_clu_assignments(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_field_with_clu_assignments(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_field_with_clu_assignments(UUID, UUID) TO service_role;
