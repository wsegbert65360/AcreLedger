BEGIN;

-- A lost create_harvest_with_grain response leaves the pair committed while the
-- device keeps the insert queued. Before the retry the pair may be edited (the
-- grain version advances) or soft-deleted, so the original whole-row comparison
-- rejected the retry forever. A retry is already applied when the stable IDs,
-- farm, and harvest link match; any identity mismatch still fails closed.
-- RLS hides tombstones from this SECURITY INVOKER function, so existing rows are
-- read through the farm-checked get_offline_sync_row_state helper. Grants are
-- unchanged.
CREATE OR REPLACE FUNCTION public.create_harvest_with_grain(
    p_farm_id uuid,
    p_idempotency_key uuid,
    p_harvest jsonb,
    p_grain_movement jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id uuid;
    v_harvest public.harvest_records%ROWTYPE;
    v_grain public.grain_movements%ROWTYPE;
    v_existing_harvest jsonb;
    v_existing_grain jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    SELECT farm_id INTO v_user_farm_id FROM public.profiles WHERE id = auth.uid();
    IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
        RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_harvest) <> 'object' OR jsonb_typeof(p_grain_movement) <> 'object' THEN
        RAISE EXCEPTION 'Harvest and grain movement payloads are required' USING ERRCODE = '22023';
    END IF;
    IF (p_harvest->>'id')::uuid IS DISTINCT FROM p_idempotency_key THEN
        RAISE EXCEPTION 'Idempotency key must match the harvest ID' USING ERRCODE = '22023';
    END IF;
    IF p_grain_movement->>'harvest_record_id' IS NOT NULL
        AND (p_grain_movement->>'harvest_record_id')::uuid <> p_idempotency_key THEN
        RAISE EXCEPTION 'Grain movement must link to the harvest' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_harvest
    FROM jsonb_populate_record(
        NULL::public.harvest_records,
        p_harvest || jsonb_build_object('farm_id', p_farm_id, 'id', p_idempotency_key, 'deleted_at', NULL)
    );
    SELECT * INTO v_grain
    FROM jsonb_populate_record(
        NULL::public.grain_movements,
        p_grain_movement || jsonb_build_object(
            'farm_id', p_farm_id,
            'harvest_record_id', p_idempotency_key,
            'deleted_at', NULL,
            'version', 1
        )
    );
    IF v_grain.id IS NULL THEN
        RAISE EXCEPTION 'Grain movement ID is required' USING ERRCODE = '22023';
    END IF;

    -- Own-farm rows only, including soft-deleted ones. An ID owned by another
    -- farm is invisible here and fails closed on the primary key below.
    v_existing_harvest := public.get_offline_sync_row_state('harvest_records', p_idempotency_key, p_farm_id);
    v_existing_grain := public.get_offline_sync_row_state('grain_movements', v_grain.id, p_farm_id);

    IF v_existing_grain IS NOT NULL THEN
        IF v_existing_harvest IS NULL THEN
            RAISE EXCEPTION 'Linked grain movement exists without its harvest' USING ERRCODE = '23503';
        END IF;
        IF (v_existing_grain->>'harvest_record_id')::uuid IS DISTINCT FROM p_idempotency_key THEN
            RAISE EXCEPTION 'Grain movement ID already belongs to a different operation' USING ERRCODE = '23505';
        END IF;
        RETURN jsonb_build_object(
            'harvest_id', p_idempotency_key,
            'grain_movement_id', v_grain.id,
            'already_applied', true
        );
    END IF;

    IF v_existing_harvest IS NOT NULL THEN
        -- Only a legacy two-row queue replayed partly by an older client leaves
        -- a harvest without its movement. Finish it while the harvest is active;
        -- never attach a live movement to a deleted harvest.
        IF v_existing_harvest->>'deleted_at' IS NOT NULL THEN
            RAISE EXCEPTION 'Idempotency key belongs to a deleted harvest without its grain movement'
                USING ERRCODE = '23505';
        END IF;
    ELSE
        INSERT INTO public.harvest_records SELECT v_harvest.*;
    END IF;
    INSERT INTO public.grain_movements SELECT v_grain.*;

    RETURN jsonb_build_object(
        'harvest_id', v_harvest.id,
        'grain_movement_id', v_grain.id,
        'already_applied', false
    );
END;
$$;

COMMIT;
