BEGIN;

-- Meter columns change only inside the equipment RPCs. A transaction-local
-- setting is the signal; ordinary client updates cannot set it.
CREATE FUNCTION public.guard_equipment_meter_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_setting('acreledger.equipment_rpc', true) IS DISTINCT FROM 'on' THEN
        IF NEW.current_reading IS DISTINCT FROM OLD.current_reading
           OR NEW.reading_updated_at IS DISTINCT FROM OLD.reading_updated_at
           OR NEW.meter_unit IS DISTINCT FROM OLD.meter_unit THEN
            RAISE EXCEPTION 'Equipment meter columns change only through equipment RPCs'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_guard_meter_columns
    BEFORE UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION public.guard_equipment_meter_columns();

REVOKE ALL ON FUNCTION public.guard_equipment_meter_columns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_equipment_meter_columns() TO authenticated, service_role;

-- Back-dated service must not move a later baseline backwards.
CREATE OR REPLACE FUNCTION public.log_maintenance(
    p_farm_id UUID,
    p_log_id UUID,
    p_equipment_id UUID,
    p_schedule_id UUID,
    p_kind TEXT,
    p_performed_on DATE,
    p_reading NUMERIC,
    p_description TEXT,
    p_performed_by TEXT,
    p_vendor TEXT,
    p_cost_parts NUMERIC,
    p_cost_labor NUMERIC,
    p_force_lower BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id UUID;
    v_equipment public.equipment%ROWTYPE;
    v_existing public.maintenance_logs%ROWTYPE;
    v_reading NUMERIC;
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

    SELECT * INTO v_equipment
    FROM public.equipment
    WHERE id = p_equipment_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_schedule_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.maintenance_schedules
        WHERE id = p_schedule_id
          AND farm_id = p_farm_id
          AND equipment_id = p_equipment_id
          AND deleted_at IS NULL
        FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'Maintenance schedule not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_existing
    FROM public.maintenance_logs
    WHERE id = p_log_id AND farm_id = p_farm_id;

    IF FOUND THEN
        IF v_existing.equipment_id IS DISTINCT FROM p_equipment_id
           OR v_existing.schedule_id IS DISTINCT FROM p_schedule_id
           OR v_existing.kind IS DISTINCT FROM p_kind
           OR v_existing.performed_on IS DISTINCT FROM p_performed_on
           OR v_existing.reading_at_service IS DISTINCT FROM p_reading
           OR v_existing.description IS DISTINCT FROM p_description
           OR v_existing.performed_by IS DISTINCT FROM p_performed_by
           OR v_existing.vendor IS DISTINCT FROM p_vendor
           OR v_existing.cost_parts IS DISTINCT FROM p_cost_parts
           OR v_existing.cost_labor IS DISTINCT FROM p_cost_labor
           OR v_existing.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Log id already belongs to a different maintenance record'
                USING ERRCODE = '23505';
        END IF;

        RETURN jsonb_build_object(
            'log_id', p_log_id,
            'equipment_id', p_equipment_id,
            'current_reading', v_equipment.current_reading,
            'already_applied', true
        );
    END IF;

    INSERT INTO public.maintenance_logs (
        id, farm_id, equipment_id, schedule_id, kind, performed_on,
        reading_at_service, description, performed_by, vendor, cost_parts, cost_labor
    ) VALUES (
        p_log_id, p_farm_id, p_equipment_id, p_schedule_id, p_kind, p_performed_on,
        p_reading, p_description, p_performed_by, p_vendor, p_cost_parts, p_cost_labor
    );

    PERFORM set_config('acreledger.equipment_rpc', 'on', true);

    IF p_reading IS NOT NULL THEN
        UPDATE public.equipment
        SET current_reading = CASE
                WHEN p_force_lower THEN p_reading
                ELSE greatest(current_reading, p_reading)
            END,
            reading_updated_at = CASE
                WHEN p_force_lower OR p_reading >= current_reading THEN now()
                ELSE reading_updated_at
            END
        WHERE id = p_equipment_id AND farm_id = p_farm_id
        RETURNING current_reading INTO v_reading;
    ELSE
        v_reading := v_equipment.current_reading;
    END IF;

    IF p_schedule_id IS NOT NULL THEN
        UPDATE public.maintenance_schedules
        SET last_done_at = CASE
                WHEN p_performed_on >= COALESCE(last_done_at, '-infinity'::date) THEN p_performed_on
                ELSE last_done_at
            END,
            last_done_reading = CASE
                WHEN p_performed_on >= COALESCE(last_done_at, '-infinity'::date) AND p_reading IS NOT NULL
                    THEN p_reading
                ELSE last_done_reading
            END
        WHERE id = p_schedule_id
          AND farm_id = p_farm_id
          AND equipment_id = p_equipment_id
          AND deleted_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'log_id', p_log_id,
        'equipment_id', p_equipment_id,
        'current_reading', v_reading,
        'already_applied', false
    );
END;
$$;

CREATE FUNCTION public.update_equipment_reading(
    p_farm_id UUID,
    p_equipment_id UUID,
    p_reading NUMERIC,
    p_force_lower BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id UUID;
    v_reading NUMERIC;
    v_updated_at TIMESTAMPTZ;
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

    IF p_reading IS NULL OR p_reading < 0 THEN
        RAISE EXCEPTION 'Meter reading must be zero or greater' USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.equipment
    WHERE id = p_equipment_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM set_config('acreledger.equipment_rpc', 'on', true);

    UPDATE public.equipment
    SET current_reading = CASE
            WHEN p_force_lower THEN p_reading
            ELSE greatest(current_reading, p_reading)
        END,
        reading_updated_at = CASE
            WHEN p_force_lower OR p_reading >= current_reading THEN now()
            ELSE reading_updated_at
        END
    WHERE id = p_equipment_id AND farm_id = p_farm_id
    RETURNING current_reading, reading_updated_at INTO v_reading, v_updated_at;

    RETURN jsonb_build_object(
        'equipment_id', p_equipment_id,
        'current_reading', v_reading,
        'reading_updated_at', v_updated_at,
        'already_applied', false
    );
END;
$$;

CREATE FUNCTION public.soft_delete_equipment_cascade(
    p_farm_id UUID,
    p_equipment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id UUID;
    v_equipment public.equipment%ROWTYPE;
    v_logs INTEGER := 0;
    v_schedules INTEGER := 0;
    v_equipment_count INTEGER := 0;
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

    SELECT * INTO v_equipment
    FROM public.equipment
    WHERE id = p_equipment_id AND farm_id = p_farm_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_equipment.deleted_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'equipment_id', p_equipment_id,
            'logs', 0,
            'schedules', 0,
            'equipment', 0,
            'already_applied', true
        );
    END IF;

    PERFORM 1
    FROM public.maintenance_logs
    WHERE farm_id = p_farm_id AND equipment_id = p_equipment_id
    FOR UPDATE;

    PERFORM 1
    FROM public.maintenance_schedules
    WHERE farm_id = p_farm_id AND equipment_id = p_equipment_id
    FOR UPDATE;

    UPDATE public.maintenance_logs
    SET deleted_at = now()
    WHERE farm_id = p_farm_id
      AND equipment_id = p_equipment_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_logs = ROW_COUNT;

    UPDATE public.maintenance_schedules
    SET deleted_at = now()
    WHERE farm_id = p_farm_id
      AND equipment_id = p_equipment_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_schedules = ROW_COUNT;

    UPDATE public.equipment
    SET deleted_at = now()
    WHERE id = p_equipment_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL;
    GET DIAGNOSTICS v_equipment_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'equipment_id', p_equipment_id,
        'logs', v_logs,
        'schedules', v_schedules,
        'equipment', v_equipment_count,
        'already_applied', false
    );
END;
$$;

CREATE FUNCTION public.set_equipment_meter_unit(
    p_farm_id UUID,
    p_equipment_id UUID,
    p_from_unit TEXT,
    p_to_unit TEXT,
    p_current_reading NUMERIC DEFAULT NULL,
    p_schedules JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_farm_id UUID;
    v_equipment public.equipment%ROWTYPE;
    v_expected UUID[];
    v_supplied UUID[];
    v_factor NUMERIC;
    v_schedule RECORD;
    v_schedule_id UUID;
    v_interval NUMERIC;
    v_last NUMERIC;
    v_count INTEGER;
    v_reading NUMERIC;
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

    IF p_from_unit NOT IN ('hours', 'miles', 'km') OR p_to_unit NOT IN ('hours', 'miles', 'km') THEN
        RAISE EXCEPTION 'Invalid meter unit' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_equipment
    FROM public.equipment
    WHERE id = p_equipment_id
      AND farm_id = p_farm_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002';
    END IF;

    PERFORM 1
    FROM public.maintenance_schedules
    WHERE farm_id = p_farm_id AND equipment_id = p_equipment_id
    FOR UPDATE;

    IF v_equipment.meter_unit = p_to_unit THEN
        RETURN jsonb_build_object(
            'equipment_id', p_equipment_id,
            'meter_unit', v_equipment.meter_unit,
            'current_reading', v_equipment.current_reading,
            'already_applied', true
        );
    END IF;

    IF v_equipment.meter_unit IS DISTINCT FROM p_from_unit THEN
        RAISE EXCEPTION 'Equipment meter unit changed since this request was made'
            USING ERRCODE = '23505';
    END IF;

    PERFORM set_config('acreledger.equipment_rpc', 'on', true);

    IF (v_equipment.meter_unit = 'hours') <> (p_to_unit = 'hours') THEN
        IF p_current_reading IS NULL OR p_current_reading < 0 THEN
            RAISE EXCEPTION 'A new meter reading is required when hours are involved'
                USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE(array_agg(id ORDER BY id), '{}')
        INTO v_expected
        FROM public.maintenance_schedules
        WHERE farm_id = p_farm_id
          AND equipment_id = p_equipment_id
          AND deleted_at IS NULL
          AND interval_value IS NOT NULL;

        SELECT COALESCE(array_agg((item->>'id')::uuid ORDER BY (item->>'id')::uuid), '{}')
        INTO v_supplied
        FROM jsonb_array_elements(COALESCE(p_schedules, '[]'::jsonb)) AS item;

        IF v_expected IS DISTINCT FROM v_supplied THEN
            RAISE EXCEPTION 'Meter-unit change must include every reading-based maintenance task'
                USING ERRCODE = '23514';
        END IF;

        FOR v_schedule IN
            SELECT jsonb_array_elements(COALESCE(p_schedules, '[]'::jsonb)) AS item
        LOOP
            v_schedule_id := (v_schedule.item->>'id')::uuid;
            v_interval := (v_schedule.item->>'interval_value')::numeric;
            IF v_schedule.item->>'last_done_reading' IS NULL THEN
                v_last := NULL;
            ELSE
                v_last := (v_schedule.item->>'last_done_reading')::numeric;
            END IF;
            IF v_interval IS NULL OR v_interval <= 0 OR (v_last IS NOT NULL AND v_last < 0) THEN
                RAISE EXCEPTION 'Invalid replacement maintenance interval' USING ERRCODE = '23514';
            END IF;

            UPDATE public.maintenance_schedules
            SET interval_value = v_interval,
                last_done_reading = v_last
            WHERE id = v_schedule_id
              AND farm_id = p_farm_id
              AND equipment_id = p_equipment_id
              AND deleted_at IS NULL
              AND interval_value IS NOT NULL;
            GET DIAGNOSTICS v_count = ROW_COUNT;
            IF v_count <> 1 THEN
                RAISE EXCEPTION 'Maintenance schedule not found' USING ERRCODE = 'P0002';
            END IF;
        END LOOP;

        UPDATE public.equipment
        SET meter_unit = p_to_unit,
            current_reading = p_current_reading,
            reading_updated_at = now()
        WHERE id = p_equipment_id AND farm_id = p_farm_id
        RETURNING current_reading INTO v_reading;
    ELSE
        v_factor := CASE
            WHEN v_equipment.meter_unit = 'miles' AND p_to_unit = 'km' THEN 1.609344
            WHEN v_equipment.meter_unit = 'km' AND p_to_unit = 'miles' THEN (1.0 / 1.609344)
            ELSE NULL
        END;
        IF v_factor IS NULL THEN
            RAISE EXCEPTION 'Unsupported meter unit change' USING ERRCODE = '23514';
        END IF;

        UPDATE public.maintenance_schedules
        SET interval_value = round(interval_value * v_factor, 1),
            last_done_reading = CASE
                WHEN last_done_reading IS NULL THEN NULL
                ELSE round(last_done_reading * v_factor, 1)
            END
        WHERE farm_id = p_farm_id
          AND equipment_id = p_equipment_id
          AND deleted_at IS NULL
          AND interval_value IS NOT NULL;

        UPDATE public.equipment
        SET meter_unit = p_to_unit,
            current_reading = round(current_reading * v_factor, 1)
        WHERE id = p_equipment_id AND farm_id = p_farm_id
        RETURNING current_reading INTO v_reading;
    END IF;

    RETURN jsonb_build_object(
        'equipment_id', p_equipment_id,
        'meter_unit', p_to_unit,
        'current_reading', v_reading,
        'already_applied', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_equipment_reading(UUID, UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_equipment_reading(UUID, UUID, NUMERIC, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.soft_delete_equipment_cascade(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_equipment_cascade(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_equipment_meter_unit(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_equipment_meter_unit(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_maintenance(
    UUID, UUID, UUID, UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN
) IS 'Records maintenance, keeps the higher meter reading unless forced, and ignores back-dated baselines.';

COMMENT ON FUNCTION public.update_equipment_reading(UUID, UUID, NUMERIC, BOOLEAN)
    IS 'The only path that changes an equipment meter reading after insert. The higher reading wins unless forced.';

COMMENT ON FUNCTION public.soft_delete_equipment_cascade(UUID, UUID)
    IS 'Soft-deletes an equipment row and its maintenance schedules and logs in one transaction.';

COMMENT ON FUNCTION public.set_equipment_meter_unit(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB)
    IS 'Converts miles and kilometres together, or replaces hours-based readings in one transaction.';

COMMIT;
