-- Custom (outside-party) spray records
-- Lightweight log for spray applications performed by an outside applicator
-- (co-op / custom spray service). Mirrors the hay record shape, not the full
-- compliance SprayRecord, so the compliance spray log stays clean.

BEGIN;

CREATE TABLE IF NOT EXISTS public.custom_spray_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    field_name TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    applicator TEXT NOT NULL DEFAULT '',
    recipe TEXT,
    wind_speed NUMERIC,
    wind_direction TEXT,
    temperature NUMERIC,
    notes TEXT,
    season_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE public.custom_spray_records ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: hide soft-deleted rows at the policy level so they stay
-- unreadable even if a client query forgets the `deleted_at IS NULL` filter.
-- (Core tables rely on the client filter for reads; this new table enforces it.)
DROP POLICY IF EXISTS custom_spray_records_select ON public.custom_spray_records;
DROP POLICY IF EXISTS custom_spray_records_insert ON public.custom_spray_records;
DROP POLICY IF EXISTS custom_spray_records_update ON public.custom_spray_records;

CREATE POLICY custom_spray_records_select ON public.custom_spray_records
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
        AND deleted_at IS NULL
    );
CREATE POLICY custom_spray_records_insert ON public.custom_spray_records
    FOR INSERT TO authenticated WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
CREATE POLICY custom_spray_records_update ON public.custom_spray_records
    FOR UPDATE TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

-- Soft-delete only: the app never hard-deletes farm records, so authenticated
-- gets SELECT/INSERT/UPDATE only (matches the hardened core tables).
REVOKE ALL ON TABLE public.custom_spray_records FROM anon;
REVOKE ALL ON TABLE public.custom_spray_records FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.custom_spray_records TO authenticated;
GRANT ALL ON TABLE public.custom_spray_records TO service_role;

CREATE INDEX IF NOT EXISTS idx_custom_spray_records_farm_season
    ON public.custom_spray_records(farm_id, season_year);
CREATE INDEX IF NOT EXISTS idx_custom_spray_records_farm_deleted
    ON public.custom_spray_records(farm_id, deleted_at);

COMMENT ON TABLE public.custom_spray_records IS 'Lightweight log of spray applications performed by an outside (custom) applicator.';
COMMENT ON COLUMN public.custom_spray_records.applicator IS 'Outside-party company or person who performed the application.';
COMMENT ON COLUMN public.custom_spray_records.recipe IS 'Free-text tank mix / recipe.';

-- Include custom_spray_records in backup restore by redefining the RPC.
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
