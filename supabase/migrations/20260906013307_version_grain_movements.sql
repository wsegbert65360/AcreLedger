BEGIN;

ALTER TABLE public.grain_movements
    ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

ALTER TABLE public.grain_movements
    DROP CONSTRAINT IF EXISTS grain_movements_version_positive;
ALTER TABLE public.grain_movements
    ADD CONSTRAINT grain_movements_version_positive CHECK (version > 0);

CREATE OR REPLACE FUNCTION public.bump_grain_movement_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grain_movements_bump_version ON public.grain_movements;
CREATE TRIGGER grain_movements_bump_version
    BEFORE UPDATE ON public.grain_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.bump_grain_movement_version();

CREATE OR REPLACE FUNCTION public.soft_delete_grain_movements_versioned(
    p_farm_id uuid,
    p_items jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id uuid;
    v_expected integer;
    v_matched integer;
    v_updated integer;
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
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one grain movement is required' USING ERRCODE = '22023';
    END IF;

    v_expected := jsonb_array_length(p_items);
    IF (
        SELECT count(DISTINCT item.id)
        FROM jsonb_to_recordset(p_items) AS item(id uuid, version bigint, deleted_at timestamptz)
    ) <> v_expected THEN
        RAISE EXCEPTION 'Grain movement IDs must be unique' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_matched
    FROM public.grain_movements AS movement
    JOIN jsonb_to_recordset(p_items) AS item(id uuid, version bigint, deleted_at timestamptz)
      ON item.id = movement.id AND item.version = movement.version
    WHERE movement.farm_id = p_farm_id
      AND movement.deleted_at IS NULL
      AND item.version > 0
      AND item.deleted_at IS NOT NULL;

    IF v_matched <> v_expected THEN
        RAISE EXCEPTION 'One or more grain movements changed or were deleted elsewhere'
            USING ERRCODE = '40001';
    END IF;

    UPDATE public.grain_movements AS movement
    SET deleted_at = item.deleted_at
    FROM jsonb_to_recordset(p_items) AS item(id uuid, version bigint, deleted_at timestamptz)
    WHERE movement.id = item.id
      AND movement.farm_id = p_farm_id
      AND movement.deleted_at IS NULL
      AND movement.version = item.version;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated <> v_expected THEN
        RAISE EXCEPTION 'Grain movements changed during deletion'
            USING ERRCODE = '40001';
    END IF;
    RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_grain_movements_versioned(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_grain_movements_versioned(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_grain_movements_versioned(uuid, jsonb) TO authenticated;

COMMIT;
