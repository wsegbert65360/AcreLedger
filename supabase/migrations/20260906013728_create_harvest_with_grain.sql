BEGIN;

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
    v_existing_harvest public.harvest_records%ROWTYPE;
    v_existing_grain public.grain_movements%ROWTYPE;
    v_harvest_exists boolean;
    v_grain_exists boolean;
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
    IF (p_harvest->>'id')::uuid <> p_idempotency_key THEN
        RAISE EXCEPTION 'Idempotency key must match the harvest ID' USING ERRCODE = '22023';
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

    SELECT * INTO v_existing_harvest
    FROM public.harvest_records
    WHERE id = p_idempotency_key AND farm_id = p_farm_id AND deleted_at IS NULL;
    v_harvest_exists := FOUND;
    SELECT * INTO v_existing_grain
    FROM public.grain_movements
    WHERE id = v_grain.id AND farm_id = p_farm_id AND deleted_at IS NULL;
    v_grain_exists := FOUND;

    IF v_harvest_exists AND (v_existing_harvest IS DISTINCT FROM v_harvest) THEN
        RAISE EXCEPTION 'Idempotency key already belongs to a different harvest' USING ERRCODE = '23505';
    END IF;
    IF v_grain_exists AND (v_existing_grain IS DISTINCT FROM v_grain) THEN
        RAISE EXCEPTION 'Grain movement ID already belongs to a different operation' USING ERRCODE = '23505';
    END IF;
    IF v_grain_exists AND NOT v_harvest_exists THEN
        RAISE EXCEPTION 'Linked grain movement exists without its harvest' USING ERRCODE = '23503';
    END IF;

    IF NOT v_harvest_exists THEN
        INSERT INTO public.harvest_records SELECT v_harvest.*;
    END IF;
    IF NOT v_grain_exists THEN
        INSERT INTO public.grain_movements SELECT v_grain.*;
    END IF;

    RETURN jsonb_build_object(
        'harvest_id', v_harvest.id,
        'grain_movement_id', v_grain.id,
        'already_applied', v_harvest_exists AND v_grain_exists
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_harvest_with_grain(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_harvest_with_grain(uuid, uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_harvest_with_grain(uuid, uuid, jsonb, jsonb) TO authenticated;

COMMIT;
