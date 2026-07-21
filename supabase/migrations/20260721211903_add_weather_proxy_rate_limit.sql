-- Durable, cross-instance quota for the authenticated weather proxy.
-- State lives outside the exposed public schema. The public RPC is the only
-- access path and derives its subject exclusively from auth.uid().

CREATE SCHEMA weather_proxy_private;
REVOKE ALL ON SCHEMA weather_proxy_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA weather_proxy_private TO service_role;

CREATE TABLE weather_proxy_private.rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);

REVOKE ALL ON TABLE weather_proxy_private.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE weather_proxy_private.rate_limits TO service_role;

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
    request_count
  )
  VALUES (caller_id, request_time, 1)
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
    END
  RETURNING request_count <= 30 INTO allowed;

  RETURN allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_weather_proxy_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_weather_proxy_request() TO authenticated, service_role;
