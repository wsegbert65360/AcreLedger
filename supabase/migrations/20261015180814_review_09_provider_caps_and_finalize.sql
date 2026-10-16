-- Review-09 owner decisions (L1, M2 global caps):
-- * Global daily spend counters live outside exposed schemas.
-- * increment_provider_daily_usage is service_role-only (Vercel handlers).
-- * finalize_ai_assistant_turn is service_role-only; authenticated cannot
--   execute it or UPDATE ai_assistant_private.turns.
-- * load_ai_assistant_history reads prior turns for the caller's user/farm.
-- Do not apply this to FarmFlow2 from this PR.

CREATE SCHEMA IF NOT EXISTS usage_private;
REVOKE ALL ON SCHEMA usage_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA usage_private TO service_role;

CREATE TABLE IF NOT EXISTS usage_private.provider_daily_usage (
  provider text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  PRIMARY KEY (provider, day)
);

REVOKE ALL ON TABLE usage_private.provider_daily_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE usage_private.provider_daily_usage TO service_role;

ALTER TABLE usage_private.provider_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_provider_daily_usage(
  p_provider text,
  p_cap integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_count integer;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('weather', 'ai') THEN
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

REVOKE ALL ON FUNCTION public.increment_provider_daily_usage(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_provider_daily_usage(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.load_ai_assistant_history(
  p_user_id uuid,
  p_farm_id uuid,
  p_limit integer
)
RETURNS TABLE(question text, answer text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.question, t.answer, t.created_at
    FROM ai_assistant_private.turns AS t
   WHERE t.user_id = p_user_id
     AND t.farm_id = p_farm_id
     AND t.finalized_at IS NOT NULL
     AND t.answer IS NOT NULL
     AND length(btrim(t.answer)) > 0
   ORDER BY t.created_at DESC
   LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 0), 10));
$$;

REVOKE ALL ON FUNCTION public.load_ai_assistant_history(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_ai_assistant_history(uuid, uuid, integer) TO service_role;

-- L1: authenticated must not finalize or rewrite turns. service_role JWT has
-- a null auth.uid(), so the function matches on turn id + open window only.
CREATE OR REPLACE FUNCTION public.finalize_ai_assistant_turn(
  p_turn_id uuid,
  p_answer text,
  p_lookups jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_answer text;
  v_lookups jsonb;
  v_count integer;
BEGIN
  IF p_turn_id IS NULL THEN
    RETURN false;
  END IF;

  v_answer := left(coalesce(p_answer, ''), 8192);
  IF p_lookups IS NULL OR octet_length(p_lookups::text) > 4096 THEN
    v_lookups := '[]'::jsonb;
  ELSE
    v_lookups := p_lookups;
  END IF;

  UPDATE ai_assistant_private.turns
     SET answer = v_answer,
         lookups = v_lookups,
         finalized_at = clock_timestamp()
   WHERE id = p_turn_id
     AND finalized_at IS NULL
     AND created_at > now() - interval '2 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_ai_assistant_turn(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_assistant_turn(uuid, text, jsonb) TO service_role;

REVOKE ALL ON TABLE ai_assistant_private.turns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE ai_assistant_private.turns TO service_role;
ALTER TABLE ai_assistant_private.turns ENABLE ROW LEVEL SECURITY;
