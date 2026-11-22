-- Review 2026-11-21 #11 (owner decision 2026-11-22): weather quota per farm.
-- Free farms get 50 weather calls per UTC day; Pro farms get 500. Free use is
-- also held to its own share of the provider cap (weather-free), so Pro farms
-- keep weather after Free use runs out. The per-user burst limit
-- (consume_weather_proxy_request: 30/min, 500/day) is unchanged.

CREATE TABLE IF NOT EXISTS weather_proxy_private.farm_daily_usage (
  farm_id uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  PRIMARY KEY (farm_id, day)
);

ALTER TABLE weather_proxy_private.farm_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE weather_proxy_private.farm_daily_usage FROM PUBLIC, anon, authenticated;

-- Returns {"allowed": bool, "pro": bool}. Signed-in callers only; the farm
-- comes from the caller's profile, never from the request.
CREATE OR REPLACE FUNCTION public.consume_weather_farm_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_farm_id uuid;
  v_plan text;
  v_pro boolean;
  v_cap integer;
  v_day date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'pro', false);
  END IF;

  SELECT p.farm_id INTO v_farm_id FROM public.profiles p WHERE p.id = auth.uid();
  IF v_farm_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'pro', false);
  END IF;

  SELECT e.plan INTO v_plan FROM public._farm_entitlement(v_farm_id) e;
  v_pro := public.entitlements_mode() IS DISTINCT FROM 'enforce'
    OR coalesce(v_plan, 'free') <> 'free';
  v_cap := CASE WHEN v_pro THEN 500 ELSE 50 END;

  INSERT INTO weather_proxy_private.farm_daily_usage AS u (farm_id, day, count)
  VALUES (v_farm_id, v_day, 1)
  ON CONFLICT (farm_id, day) DO UPDATE
    SET count = u.count + 1
    WHERE u.count < v_cap
  RETURNING count INTO v_count;

  RETURN jsonb_build_object('allowed', v_count IS NOT NULL, 'pro', v_pro);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_weather_farm_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_weather_farm_request() TO authenticated;

-- Allow the Free share of the weather cap as its own counter.
CREATE OR REPLACE FUNCTION public.increment_provider_daily_usage(p_provider text, p_cap integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_count integer;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('weather', 'weather-free', 'ai') THEN
    RETURN false;
  END IF;
  IF p_cap IS NULL OR p_cap < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO usage_private.provider_daily_usage AS current_usage (
    provider,
    day,
    count
  )
  VALUES (p_provider, v_day, 1)
  ON CONFLICT (provider, day) DO UPDATE
    SET count = current_usage.count + 1
    WHERE current_usage.count < p_cap
  RETURNING count INTO v_count;

  RETURN v_count IS NOT NULL;
END;
$$;
