-- Recovered verbatim from production (FarmFlow2, supabase_migrations.schema_migrations
-- version 20261119202950) on 2026-11-19. The original file and the app code that uses
-- these tables were never committed. Do not edit: this is applied in production.
BEGIN;

CREATE TABLE IF NOT EXISTS public.county_boundaries (
  dataset_version text NOT NULL CHECK (btrim(dataset_version) <> ''),
  fips text NOT NULL CHECK (fips ~ '^[0-9]{5}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  state_abbr text NOT NULL CHECK (state_abbr ~ '^[A-Z]{2}$'),
  state_fips text NOT NULL CHECK (state_fips ~ '^[0-9]{2}$' AND state_fips = left(fips, 2)),
  geometry jsonb NOT NULL CHECK (geometry ->> 'type' IN ('Polygon', 'MultiPolygon')),
  min_lng double precision NOT NULL,
  min_lat double precision NOT NULL,
  max_lng double precision NOT NULL,
  max_lat double precision NOT NULL,
  dataset_source text NOT NULL CHECK (btrim(dataset_source) <> ''),
  is_current boolean NOT NULL DEFAULT false,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_version, fips),
  CHECK (min_lng <= max_lng AND min_lat <= max_lat)
);

CREATE UNIQUE INDEX IF NOT EXISTS county_boundaries_current_fips
  ON public.county_boundaries (fips) WHERE is_current;
CREATE INDEX IF NOT EXISTS county_boundaries_bbox
  ON public.county_boundaries (min_lng, max_lng, min_lat, max_lat) WHERE is_current;

ALTER TABLE public.county_boundaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY county_boundaries_select ON public.county_boundaries
  FOR SELECT TO authenticated USING (is_current);

REVOKE ALL ON TABLE public.county_boundaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.county_boundaries TO authenticated;
GRANT ALL ON TABLE public.county_boundaries TO service_role;

COMMENT ON TABLE public.county_boundaries IS
  'US county boundaries (Census TIGER/Line). Loaded by scripts/county/build-county-boundaries.mjs; clients read the current version only.';

CREATE OR REPLACE FUNCTION public.get_county_boundaries(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
RETURNS TABLE (
  fips text, name text, state_abbr text, state_fips text, geometry jsonb,
  dataset_source text, dataset_version text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT b.fips, b.name, b.state_abbr, b.state_fips, b.geometry, b.dataset_source, b.dataset_version
  FROM public.county_boundaries AS b
  WHERE b.is_current
    AND b.min_lng <= p_max_lng AND b.max_lng >= p_min_lng
    AND b.min_lat <= p_max_lat AND b.max_lat >= p_min_lat
  ORDER BY b.fips
  LIMIT 40;
$$;

REVOKE ALL ON FUNCTION public.get_county_boundaries(double precision, double precision, double precision, double precision)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_county_boundaries(double precision, double precision, double precision, double precision)
  TO authenticated, service_role;

CREATE TABLE public.county_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('clu', 'field')),
  subject_key text NOT NULL CHECK (btrim(subject_key) <> ''),
  field_id uuid,
  tract_key text,
  clu_number text,
  county_fips text CHECK (county_fips ~ '^[0-9]{5}$'),
  county_name text,
  state_abbr text,
  mapped_acres numeric(14, 4) CHECK (mapped_acres >= 0),
  proportion numeric(7, 6) CHECK (proportion >= 0 AND proportion <= 1),
  manual_acres numeric(12, 2) CHECK (manual_acres > 0),
  method text NOT NULL CHECK (method IN ('geometry', 'centroid', 'manual', 'unresolved')),
  review_status text NOT NULL DEFAULT 'ok' CHECK (review_status IN ('ok', 'needs_review', 'reviewed')),
  review_reason text,
  geometry_hash text,
  dataset_source text,
  dataset_version text,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT county_assignments_farm_id_id_key UNIQUE (farm_id, id),
  CONSTRAINT county_assignments_subject_shape CHECK (
    (subject_type = 'field' AND field_id IS NOT NULL AND tract_key IS NULL AND clu_number IS NULL
      AND subject_key = field_id::text)
    OR
    (subject_type = 'clu' AND field_id IS NULL AND tract_key IS NOT NULL AND clu_number IS NOT NULL
      AND subject_key = tract_key || ':' || clu_number)
  ),
  CONSTRAINT county_assignments_unresolved_has_no_county CHECK ((method = 'unresolved') = (county_fips IS NULL)),
  CONSTRAINT county_assignments_manual_has_acres CHECK ((method = 'manual') = (manual_acres IS NOT NULL)),
  CONSTRAINT county_assignments_farm_field_fk
    FOREIGN KEY (farm_id, field_id) REFERENCES public.fields(farm_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX county_assignments_live_unique
  ON public.county_assignments (farm_id, subject_type, subject_key, (coalesce(county_fips, 'unresolved')))
  WHERE deleted_at IS NULL;
CREATE INDEX county_assignments_farm_subject
  ON public.county_assignments (farm_id, subject_type, subject_key) WHERE deleted_at IS NULL;
CREATE INDEX county_assignments_farm_county
  ON public.county_assignments (farm_id, county_fips) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.county_assignments_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER county_assignments_touch
  BEFORE UPDATE ON public.county_assignments
  FOR EACH ROW EXECUTE FUNCTION public.county_assignments_touch();

ALTER TABLE public.county_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY county_assignments_select ON public.county_assignments
  FOR SELECT TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    AND deleted_at IS NULL
  );
CREATE POLICY county_assignments_insert ON public.county_assignments
  FOR INSERT TO authenticated WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY county_assignments_update ON public.county_assignments
  FOR UPDATE TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  ) WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Restrict updates on deleted rows" ON public.county_assignments
  AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

REVOKE ALL ON TABLE public.county_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.county_assignments TO authenticated;
GRANT ALL ON TABLE public.county_assignments TO service_role;

COMMENT ON TABLE public.county_assignments IS
  'Physical county of a field or CLU polygon (not the administering FSA office county). Mapped acres are geodesic; recorded acreage lives on fields and CLU assignments.';
COMMENT ON COLUMN public.county_assignments.subject_key IS
  'field id, or tract_key:clu_number. Unique only within a farm.';
COMMENT ON COLUMN public.county_assignments.geometry_hash IS
  'Hash of the geometry the row was calculated (or manually corrected) against; a different hash after a manual correction flags review.';

CREATE OR REPLACE FUNCTION public.soft_delete_county_assignment(
  p_farm_id uuid,
  p_id uuid,
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_user_farm_id FROM public.profiles WHERE id = auth.uid();
  IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
    RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.county_assignments
     SET deleted_at = coalesce(p_deleted_at, now())
   WHERE id = p_id AND farm_id = p_farm_id AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_county_assignment(uuid, uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_county_assignment(uuid, uuid, timestamptz)
  TO authenticated, service_role;

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
    'fsa_tract_imports', 'field_clu_assignments', 'work_requests',
    'equipment', 'maintenance_schedules', 'maintenance_logs',
    'cattle_groups', 'county_assignments'
  ) THEN
    RAISE EXCEPTION 'Unsupported offline sync table' USING ERRCODE = '22023';
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
  ) INTO v_row USING p_row_id, p_farm_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_offline_sync_row_state(text, uuid, uuid)
  TO authenticated, service_role;

COMMIT;
