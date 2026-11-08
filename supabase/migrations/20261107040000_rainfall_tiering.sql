-- Free tier, Phase 4: rainfall tiering. Nothing changes while entitlements mode = 'off'.
--   * Paid farms: hourly rainfall on every eligible field (as today).
--   * Free farms (enforce mode only): daily totals on their 2 oldest eligible fields.
-- Nothing is deleted; existing hourly history stays.

-- Drift fix: production already has fields.created_at, but no repo migration created it.
-- No-op on production. Needed so a fresh rebuild can order fields by age.
ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- One total per field per "rain day": the 24 hours ending at 8:00 America/Chicago on rain_date.
-- Written by the mrms-daily Edge Function (service role). Read by clients only via RPC below.
CREATE TABLE IF NOT EXISTS public.field_rainfall_daily (
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  rain_date date NOT NULL,
  rainfall_in numeric NOT NULL CHECK (rainfall_in >= 0),
  source text NOT NULL DEFAULT 'MRMS 24H',
  finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (field_id, rain_date)
);
ALTER TABLE public.field_rainfall_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.field_rainfall_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.field_rainfall_daily TO service_role;
COMMENT ON TABLE public.field_rainfall_daily IS
  'Daily rainfall (24h ending 8:00 America/Chicago) for free-tier fields. service_role writes; clients read via get_field_rainfall_daily only.';

-- Outcome ledger for the daily run, one row per rain day. Service role only.
CREATE TABLE IF NOT EXISTS public.mrms_daily_runs (
  rain_date date PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('success', 'no_data', 'failed')),
  source text,
  field_count integer,
  record_count integer,
  error_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mrms_daily_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mrms_daily_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mrms_daily_runs TO service_role;

-- Fields eligible for any rainfall collection: active and with coordinates.
-- Slot rule: oldest first (created_at, NULLs last, then id), capped by the farm's rainfall_slot_cap.
CREATE OR REPLACE FUNCTION public.rainfall_slot_field_ids(p_farm_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.id FROM public.fields f
  WHERE f.farm_id = p_farm_id AND f.deleted_at IS NULL AND f.lat IS NOT NULL AND f.lng IS NOT NULL
  ORDER BY f.created_at NULLS LAST, f.id
  LIMIT (SELECT e.rainfall_slot_cap FROM public._farm_entitlement(p_farm_id) e)
$$;
REVOKE ALL ON FUNCTION public.rainfall_slot_field_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rainfall_slot_field_ids(uuid) TO service_role;

-- Client-callable: which of my farm's fields have rainfall (slot fields on free, all eligible on paid).
CREATE OR REPLACE FUNCTION public.farm_rainfall_field_ids(p_farm_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s FROM public.rainfall_slot_field_ids(p_farm_id) s
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.farm_id = p_farm_id)
$$;
REVOKE ALL ON FUNCTION public.farm_rainfall_field_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.farm_rainfall_field_ids(uuid) TO authenticated, service_role;

-- The ONE function every rainfall writer uses to choose fields (mrms-hourly, mrms-backfill, mrms-daily).
-- Keyset-paginated by field id (pass the last id as p_after); callers loop until a short page.
--   'hourly': every eligible field, except free-plan farms when mode = 'enforce'.
--   'daily' : the slot fields of free-plan farms.
CREATE OR REPLACE FUNCTION public.rainfall_collectable_fields(
  p_tier text, p_after uuid DEFAULT NULL, p_limit int DEFAULT 1000
)
RETURNS TABLE (id uuid, lat numeric, lng numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enforce boolean := public.entitlements_mode() = 'enforce';
  v_limit int := least(greatest(coalesce(p_limit, 1000), 1), 10000);
BEGIN
  IF p_tier = 'hourly' THEN
    RETURN QUERY
    SELECT f.id, f.lat, f.lng FROM public.fields f
    WHERE f.deleted_at IS NULL AND f.lat IS NOT NULL AND f.lng IS NOT NULL
      AND (p_after IS NULL OR f.id > p_after)
      AND (NOT v_enforce OR (SELECT e.plan FROM public._farm_entitlement(f.farm_id) e) <> 'free')
    ORDER BY f.id
    LIMIT v_limit;
  ELSIF p_tier IN ('daily', 'daily_any') THEN
    -- 'daily' collects nothing while mode = 'off' so that mode behaves exactly as before.
    -- 'daily_any' ignores the mode (used by the seed function so it can run before shadow).
    IF p_tier = 'daily' AND NOT (public.entitlements_mode() <> 'off') THEN
      RETURN;
    END IF;
    RETURN QUERY
    SELECT r.id, r.lat, r.lng FROM (
      SELECT f.id, f.lat, f.lng, f.farm_id,
             row_number() OVER (PARTITION BY f.farm_id ORDER BY f.created_at NULLS LAST, f.id) AS rn
      FROM public.fields f
      WHERE f.deleted_at IS NULL AND f.lat IS NOT NULL AND f.lng IS NOT NULL
    ) r
    WHERE r.rn <= (SELECT l.rainfall_slot_cap FROM public.entitlement_free_limits() l)
      AND (p_after IS NULL OR r.id > p_after)
      AND (SELECT e.plan FROM public._farm_entitlement(r.farm_id) e) = 'free'
    ORDER BY r.id
    LIMIT v_limit;
  ELSE
    RAISE EXCEPTION 'unknown rainfall tier: %', p_tier USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rainfall_collectable_fields(text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rainfall_collectable_fields(text, uuid, int) TO service_role;

-- Client read path for free farms. In enforce mode a free farm may read only its slot fields;
-- any other field raises premium_required:rainfall. Non-members get no rows.
CREATE OR REPLACE FUNCTION public.get_field_rainfall_daily(p_field_id uuid, p_start date, p_end date)
RETURNS TABLE (rain_date date, rainfall_in numeric, finalized boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_farm uuid;
BEGIN
  SELECT f.farm_id INTO v_farm
  FROM public.fields f
  JOIN public.profiles p ON p.farm_id = f.farm_id AND p.id = auth.uid()
  WHERE f.id = p_field_id;
  IF v_farm IS NULL THEN RETURN; END IF;

  IF public.entitlements_mode() = 'enforce'
     AND (SELECT e.plan FROM public._farm_entitlement(v_farm) e) = 'free'
     AND NOT EXISTS (SELECT 1 FROM public.rainfall_slot_field_ids(v_farm) s WHERE s = p_field_id) THEN
    RAISE EXCEPTION 'premium_required:rainfall' USING ERRCODE = 'P0402';
  END IF;

  RETURN QUERY
  SELECT d.rain_date, d.rainfall_in, d.finalized
  FROM public.field_rainfall_daily d
  WHERE d.field_id = p_field_id AND d.rain_date BETWEEN p_start AND p_end
  ORDER BY d.rain_date
  LIMIT 1100;
END;
$$;
REVOKE ALL ON FUNCTION public.get_field_rainfall_daily(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_field_rainfall_daily(uuid, date, date) TO authenticated, service_role;

-- One-off/maintenance: build daily totals for free-tier slot fields from hourly rows that already exist,
-- so a farm sees history immediately. Rain day = local calendar window ending 8:00 America/Chicago
-- (23-25 hourly rows on the two DST days). Never overwrites an existing daily row. Service role only.
CREATE OR REPLACE FUNCTION public.seed_field_rainfall_daily_from_hourly(p_field_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_n integer;
BEGIN
  IF p_field_id IS NOT NULL THEN
    v_ids := ARRAY[p_field_id];
  ELSE
    SELECT coalesce(array_agg(c.id), ARRAY[]::uuid[]) INTO v_ids
    FROM public.rainfall_collectable_fields('daily_any', NULL, 10000) c;
  END IF;

  WITH hrs AS (
    SELECT h.field_id,
           ((timezone('America/Chicago', h.timestamp_utc) - interval '8 hours' - interval '1 microsecond')::date + 1) AS rain_date,
           h.rainfall_in
    FROM public.field_rainfall_hourly h
    WHERE h.field_id = ANY (v_ids) AND h.finalized
  ), ins AS (
    INSERT INTO public.field_rainfall_daily (field_id, rain_date, rainfall_in, source, finalized)
    SELECT field_id, rain_date, sum(rainfall_in), 'MRMS 01H sum', true
    FROM hrs
    GROUP BY field_id, rain_date
    HAVING count(*) BETWEEN 23 AND 25
    ON CONFLICT (field_id, rain_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_n FROM ins;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_field_rainfall_daily_from_hourly(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_field_rainfall_daily_from_hourly(uuid) TO service_role;
