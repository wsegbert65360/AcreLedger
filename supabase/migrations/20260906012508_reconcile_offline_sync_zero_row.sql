BEGIN;

-- RLS intentionally hides tombstones, so a zero-row replayed UPDATE cannot
-- tell an already-completed soft delete from a missing/conflicting target.
-- This helper exposes one own-farm row (including deleted_at) for reconciliation
-- while keeping table selection allowlisted and the caller's farm authoritative.
CREATE OR REPLACE FUNCTION public.get_offline_sync_row_state(
    p_table_name text,
    p_row_id uuid,
    p_farm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id uuid;
    v_row jsonb;
BEGIN
    IF p_table_name NOT IN (
        'fields', 'bins', 'plant_records', 'spray_records',
        'harvest_records', 'hay_harvest_records', 'custom_spray_records',
        'fertilizer_applications', 'tillage_records', 'grain_movements',
        'saved_seeds', 'fertilizer_recipes', 'spray_recipes',
        'fsa_tract_imports', 'field_clu_assignments', 'work_requests'
    ) THEN
        RAISE EXCEPTION 'Unsupported offline sync table'
            USING ERRCODE = '22023';
    END IF;

    IF current_user <> 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
        END IF;
        SELECT farm_id INTO v_user_farm_id
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
            RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
        END IF;
    END IF;

    EXECUTE format(
        'SELECT to_jsonb(row_value) FROM public.%I AS row_value WHERE id = $1 AND farm_id = $2',
        p_table_name
    )
    INTO v_row
    USING p_row_id, p_farm_id;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid) TO service_role;

COMMIT;
