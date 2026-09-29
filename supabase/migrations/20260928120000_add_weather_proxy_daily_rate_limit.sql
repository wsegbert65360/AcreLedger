-- Add a rolling per-user daily quota to the existing atomic weather-proxy
-- minute limiter. Both counters are updated in the same upsert so concurrent
-- Vercel instances cannot bypass either limit.

ALTER TABLE weather_proxy_private.rate_limits
  ADD COLUMN daily_window_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN daily_request_count integer NOT NULL DEFAULT 0
    CHECK (daily_request_count >= 0);

CREATE OR REPLACE FUNCTION public.consume_weather_proxy_request()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  request_time timestamptz := clock_timestamp();
  allowed boolean;
BEGIN
  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO weather_proxy_private.rate_limits AS current_limit (
    user_id,
    window_started_at,
    request_count,
    daily_window_started_at,
    daily_request_count
  )
  VALUES (caller_id, request_time, 1, request_time, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_limit.window_started_at <= request_time - interval '1 minute'
        THEN request_time
      ELSE current_limit.window_started_at
    END,
    request_count = CASE
      WHEN current_limit.window_started_at <= request_time - interval '1 minute'
        THEN 1
      ELSE current_limit.request_count + 1
    END,
    daily_window_started_at = CASE
      WHEN current_limit.daily_window_started_at <= request_time - interval '24 hours'
        THEN request_time
      ELSE current_limit.daily_window_started_at
    END,
    daily_request_count = CASE
      WHEN current_limit.daily_window_started_at <= request_time - interval '24 hours'
        THEN 1
      ELSE current_limit.daily_request_count + 1
    END
  RETURNING request_count <= 30 AND daily_request_count <= 500 INTO allowed;

  RETURN allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_weather_proxy_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_weather_proxy_request() TO authenticated, service_role;
