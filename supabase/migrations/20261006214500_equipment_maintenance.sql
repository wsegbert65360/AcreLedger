BEGIN;

CREATE TABLE public.equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN (
        'tractor', 'combine', 'sprayer', 'planter', 'tillage', 'truck', 'implement', 'other'
    )),
    year INTEGER CHECK (year BETWEEN 1900 AND 2100),
    make TEXT,
    model TEXT,
    serial_number TEXT,
    meter_unit TEXT NOT NULL DEFAULT 'hours' CHECK (meter_unit IN ('hours', 'miles', 'km')),
    current_reading NUMERIC(10, 1) NOT NULL DEFAULT 0 CHECK (current_reading >= 0),
    reading_updated_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'retired')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT equipment_farm_id_id_unique UNIQUE (farm_id, id)
);

CREATE TABLE public.maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL,
    task_name TEXT NOT NULL CHECK (btrim(task_name) <> ''),
    interval_value NUMERIC(10, 1) CHECK (interval_value > 0),
    interval_days INTEGER CHECK (interval_days > 0),
    last_done_reading NUMERIC(10, 1) CHECK (last_done_reading >= 0),
    last_done_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT maintenance_schedules_interval_required
        CHECK (interval_value IS NOT NULL OR interval_days IS NOT NULL),
    CONSTRAINT maintenance_schedules_farm_equipment_fk
        FOREIGN KEY (farm_id, equipment_id)
        REFERENCES public.equipment(farm_id, id),
    CONSTRAINT maintenance_schedules_farm_equipment_id_unique
        UNIQUE (farm_id, equipment_id, id)
);

CREATE TABLE public.maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    equipment_id UUID NOT NULL,
    schedule_id UUID,
    kind TEXT NOT NULL CHECK (kind IN ('service', 'repair')),
    performed_on DATE NOT NULL,
    reading_at_service NUMERIC(10, 1) CHECK (reading_at_service >= 0),
    description TEXT,
    performed_by TEXT,
    vendor TEXT,
    cost_parts NUMERIC(12, 2) CHECK (cost_parts >= 0),
    cost_labor NUMERIC(12, 2) CHECK (cost_labor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT maintenance_logs_farm_equipment_fk
        FOREIGN KEY (farm_id, equipment_id)
        REFERENCES public.equipment(farm_id, id),
    CONSTRAINT maintenance_logs_schedule_requires_service
        CHECK (schedule_id IS NULL OR kind = 'service'),
    CONSTRAINT maintenance_logs_farm_equipment_schedule_fk
        FOREIGN KEY (farm_id, equipment_id, schedule_id)
        REFERENCES public.maintenance_schedules(farm_id, equipment_id, id)
);

CREATE INDEX ON public.equipment (farm_id, deleted_at);
CREATE INDEX ON public.maintenance_schedules (farm_id, deleted_at);
CREATE INDEX ON public.maintenance_logs (farm_id, deleted_at);
CREATE INDEX ON public.maintenance_schedules (equipment_id) WHERE deleted_at IS NULL;
CREATE INDEX ON public.maintenance_logs (equipment_id, performed_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX ON public.maintenance_logs (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE UNIQUE INDEX maintenance_schedules_task_name_unique
    ON public.maintenance_schedules (equipment_id, lower(btrim(task_name)))
    WHERE deleted_at IS NULL;

CREATE FUNCTION public.set_equipment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_set_updated_at
    BEFORE UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION public.set_equipment_updated_at();
CREATE TRIGGER maintenance_schedules_set_updated_at
    BEFORE UPDATE ON public.maintenance_schedules
    FOR EACH ROW EXECUTE FUNCTION public.set_equipment_updated_at();
CREATE TRIGGER maintenance_logs_set_updated_at
    BEFORE UPDATE ON public.maintenance_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_equipment_updated_at();

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_select ON public.equipment
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );
CREATE POLICY equipment_insert ON public.equipment
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY equipment_update ON public.equipment
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY "Restrict updates on deleted rows" ON public.equipment
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

CREATE POLICY maintenance_schedules_select ON public.maintenance_schedules
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );
CREATE POLICY maintenance_schedules_insert ON public.maintenance_schedules
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY maintenance_schedules_update ON public.maintenance_schedules
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY "Restrict updates on deleted rows" ON public.maintenance_schedules
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

CREATE POLICY maintenance_logs_select ON public.maintenance_logs
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );
CREATE POLICY maintenance_logs_insert ON public.maintenance_logs
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY maintenance_logs_update ON public.maintenance_logs
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    ) WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY "Restrict updates on deleted rows" ON public.maintenance_logs
    AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

REVOKE ALL ON TABLE public.equipment, public.maintenance_schedules, public.maintenance_logs
    FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.equipment, public.maintenance_schedules, public.maintenance_logs
    TO authenticated;
GRANT ALL ON TABLE public.equipment, public.maintenance_schedules, public.maintenance_logs
    TO service_role;

CREATE FUNCTION public.log_maintenance(
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
        WHERE id = p_equipment_id AND farm_id = p_farm_id;
    END IF;

    IF p_schedule_id IS NOT NULL THEN
        UPDATE public.maintenance_schedules
        SET last_done_reading = p_reading,
            last_done_at = p_performed_on
        WHERE id = p_schedule_id
          AND farm_id = p_farm_id
          AND equipment_id = p_equipment_id;
    END IF;

    RETURN jsonb_build_object(
        'log_id', p_log_id,
        'equipment_id', p_equipment_id,
        'already_applied', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.log_maintenance(
    UUID, UUID, UUID, UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_maintenance(
    UUID, UUID, UUID, UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN
) TO authenticated, service_role;

COMMENT ON TABLE public.equipment IS 'Farm equipment with a single hours, miles, or kilometre meter.';
COMMENT ON TABLE public.maintenance_schedules IS 'Recurring meter- and/or calendar-based maintenance tasks for equipment.';
COMMENT ON TABLE public.maintenance_logs IS 'Completed routine service and one-off repair history for equipment.';
COMMENT ON FUNCTION public.log_maintenance(
    UUID, UUID, UUID, UUID, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN
) IS 'Atomically records maintenance and advances equipment/schedule baselines with idempotent log IDs.';

COMMIT;
