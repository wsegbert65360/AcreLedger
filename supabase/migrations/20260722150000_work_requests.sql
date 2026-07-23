-- Work Requests — outbound service requests sent to a provider/applicator
-- (spraying, fertilizer, lime, planting, harvesting, other).
--
-- Work requests are status-driven (Draft/Sent/Completed/Canceled), NOT
-- season-scoped. crop_year is plain validated data; the client list is not
-- filtered by viewing season. Products and per-field entries are stored as
-- JSONB columns on the row (matches spray_records.products precedent — no
-- child tables). A UNIQUE(farm_id, request_number) constraint backstops the
-- client-generated request number.

BEGIN;

CREATE TABLE IF NOT EXISTS public.work_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    request_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT,
    customer_billing_address TEXT,
    provider_name TEXT,
    provider_email TEXT,
    work_type TEXT NOT NULL DEFAULT 'other',
    requested_completion_date DATE,
    crop TEXT,
    crop_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
    current_crop_stage TEXT,
    previous_crop TEXT,
    next_planned_crop TEXT,
    notes TEXT,
    products JSONB NOT NULL DEFAULT '[]'::jsonb,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT work_requests_request_number_unique UNIQUE (farm_id, request_number),
    CONSTRAINT work_requests_status_check CHECK (status IN ('Draft', 'Sent', 'Completed', 'Canceled')),
    CONSTRAINT work_requests_work_type_check CHECK (work_type IN ('spraying', 'fertilizer', 'lime', 'planting', 'harvesting', 'other')),
    CONSTRAINT work_requests_crop_year_range CHECK (crop_year BETWEEN 2000 AND EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
);

ALTER TABLE public.work_requests ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: hide soft-deleted rows at the policy level.
DROP POLICY IF EXISTS work_requests_select ON public.work_requests;
DROP POLICY IF EXISTS work_requests_insert ON public.work_requests;
DROP POLICY IF EXISTS work_requests_update ON public.work_requests;

CREATE POLICY work_requests_select ON public.work_requests
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );
CREATE POLICY work_requests_insert ON public.work_requests
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY work_requests_update ON public.work_requests
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

-- Soft-delete only: the app never hard-deletes farm records, so authenticated
-- gets SELECT/INSERT/UPDATE only (matches the hardened core tables).
REVOKE ALL ON TABLE public.work_requests FROM anon;
REVOKE ALL ON TABLE public.work_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.work_requests TO authenticated;
GRANT ALL ON TABLE public.work_requests TO service_role;

CREATE INDEX IF NOT EXISTS idx_work_requests_farm_deleted
    ON public.work_requests(farm_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_work_requests_farm_status
    ON public.work_requests(farm_id, status);
CREATE INDEX IF NOT EXISTS idx_work_requests_farm_created
    ON public.work_requests(farm_id, created_at DESC);

COMMENT ON TABLE public.work_requests IS 'Outbound service work requests sent to a provider/applicator.';
COMMENT ON COLUMN public.work_requests.request_number IS 'Human-readable, unique-per-farm request number (e.g. WR-2026-AB12CD).';
COMMENT ON COLUMN public.work_requests.products IS 'JSONB array of products applied (applies to all fields by default).';
COMMENT ON COLUMN public.work_requests.fields IS 'JSONB array of per-field entries (snapshots of field data at creation time, plus chosen nav point and nearby road).';

-- Include work_requests in backup restore by redefining the RPC.
CREATE OR REPLACE FUNCTION public.restore_farm_backup(
  p_payload jsonb,
  p_active_season integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT farm_id
  INTO v_farm_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Restore payload must be a JSON object.';
  END IF;

  -- Preserve the database-side active-season guard from
  -- 20260716021120_protect_active_season.sql. This SECURITY DEFINER function
  -- must validate independently of the client before restoring any rows.
  IF p_active_season IS NOT NULL AND (
    p_active_season < 2000
    OR p_active_season > EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1
  ) THEN
    RAISE EXCEPTION 'Invalid active season: %. Must be between 2000 and %.',
      p_active_season,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1
      USING ERRCODE = '22023';
  END IF;

  v_result := jsonb_build_object(
    'fields',                  public._restore_table_for_farm('public.fields'::regclass, p_payload->'fields', v_farm_id),
    'bins',                    public._restore_table_for_farm('public.bins'::regclass, p_payload->'bins', v_farm_id),
    'plant_records',           public._restore_table_for_farm('public.plant_records'::regclass, p_payload->'plant_records', v_farm_id),
    'spray_records',           public._restore_table_for_farm('public.spray_records'::regclass, p_payload->'spray_records', v_farm_id),
    'harvest_records',         public._restore_table_for_farm('public.harvest_records'::regclass, p_payload->'harvest_records', v_farm_id),
    'hay_harvest_records',     public._restore_table_for_farm('public.hay_harvest_records'::regclass, p_payload->'hay_harvest_records', v_farm_id),
    'custom_spray_records',    public._restore_table_for_farm('public.custom_spray_records'::regclass, p_payload->'custom_spray_records', v_farm_id),
    'fertilizer_applications', public._restore_table_for_farm('public.fertilizer_applications'::regclass, p_payload->'fertilizer_applications', v_farm_id),
    'tillage_records',         public._restore_table_for_farm('public.tillage_records'::regclass, p_payload->'tillage_records', v_farm_id),
    'grain_movements',         public._restore_table_for_farm('public.grain_movements'::regclass, p_payload->'grain_movements', v_farm_id),
    'saved_seeds',             public._restore_table_for_farm('public.saved_seeds'::regclass, p_payload->'saved_seeds', v_farm_id),
    'fertilizer_recipes',      public._restore_table_for_farm('public.fertilizer_recipes'::regclass, p_payload->'fertilizer_recipes', v_farm_id),
    'spray_recipes',           public._restore_table_for_farm('public.spray_recipes'::regclass, p_payload->'spray_recipes', v_farm_id),
    'work_requests',           public._restore_table_for_farm('public.work_requests'::regclass, p_payload->'work_requests', v_farm_id),
    'fsa_tract_imports',       public._restore_table_for_farm_with_conflict('public.fsa_tract_imports'::regclass, p_payload->'fsa_tract_imports', v_farm_id, ARRAY['farm_id', 'tract_key']),
    'field_clu_assignments',   public._restore_table_for_farm_with_conflict('public.field_clu_assignments'::regclass, p_payload->'field_clu_assignments', v_farm_id, ARRAY['farm_id', 'tract_key', 'clu_number'])
  );

  IF p_active_season IS NOT NULL THEN
    UPDATE public.profiles
    SET active_season = p_active_season
    WHERE id = v_user_id;

    v_result := v_result || jsonb_build_object('active_season', p_active_season);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;

COMMIT;
