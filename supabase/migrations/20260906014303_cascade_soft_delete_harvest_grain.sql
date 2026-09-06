-- Keep harvest records and their generated bin movements lifecycle-consistent.
-- The trigger protects every write path, including generic offline queue replay.
CREATE OR REPLACE FUNCTION public.cascade_harvest_soft_delete_to_grain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.grain_movements
        SET deleted_at = NEW.deleted_at
        WHERE farm_id = NEW.farm_id
          AND harvest_record_id = NEW.id
          AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS harvest_records_cascade_soft_delete_to_grain ON public.harvest_records;
CREATE TRIGGER harvest_records_cascade_soft_delete_to_grain
AFTER UPDATE OF deleted_at ON public.harvest_records
FOR EACH ROW
EXECUTE FUNCTION public.cascade_harvest_soft_delete_to_grain();

CREATE OR REPLACE FUNCTION public.soft_delete_harvests_with_grain(
    p_farm_id uuid,
    p_harvest_ids uuid[],
    p_deleted_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id uuid;
    v_requested_count integer;
    v_harvest_count integer;
    v_grain_count integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    SELECT farm_id INTO v_user_farm_id
    FROM public.profiles
    WHERE id = auth.uid();
    IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
        RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
    END IF;
    IF p_deleted_at IS NULL OR p_harvest_ids IS NULL OR cardinality(p_harvest_ids) = 0 THEN
        RAISE EXCEPTION 'Harvest IDs and deletion time are required' USING ERRCODE = '22023';
    END IF;

    SELECT count(DISTINCT id) INTO v_requested_count
    FROM unnest(p_harvest_ids) AS requested(id);
    IF v_requested_count <> cardinality(p_harvest_ids) THEN
        RAISE EXCEPTION 'Duplicate harvest IDs are not allowed' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_harvest_count
    FROM (
        SELECT id
        FROM public.harvest_records
        WHERE farm_id = p_farm_id
          AND id = ANY(p_harvest_ids)
          AND deleted_at IS NULL
        FOR UPDATE
    ) AS locked_harvests;
    IF v_harvest_count <> v_requested_count THEN
        RAISE EXCEPTION 'One or more harvest records changed; refresh and try again'
            USING ERRCODE = '40001';
    END IF;

    SELECT count(*) INTO v_grain_count
    FROM public.grain_movements
    WHERE farm_id = p_farm_id
      AND harvest_record_id = ANY(p_harvest_ids)
      AND deleted_at IS NULL;

    UPDATE public.harvest_records
    SET deleted_at = p_deleted_at
    WHERE farm_id = p_farm_id
      AND id = ANY(p_harvest_ids)
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_harvest_count = ROW_COUNT;
    IF v_harvest_count <> v_requested_count THEN
        RAISE EXCEPTION 'Harvest deletion conflict; refresh and try again'
            USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
        'harvest_count', v_harvest_count,
        'grain_movement_count', v_grain_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_harvests_with_grain(uuid, uuid[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_harvests_with_grain(uuid, uuid[], timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_harvests_with_grain(uuid, uuid[], timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_harvests_with_grain(uuid, uuid[], timestamptz) TO service_role;
