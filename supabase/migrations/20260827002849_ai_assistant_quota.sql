-- Durable, cross-instance daily question cap and non-abusable audit log
-- for the authenticated AI assistant. State lives outside the exposed public
-- schema. Identity is derived exclusively from auth.uid().
--
-- Daily windows use the UTC calendar day of clock_timestamp()
-- ((timestamptz AT TIME ZONE 'UTC')::date), not a rolling 24-hour window.

CREATE SCHEMA ai_assistant_private;
REVOKE ALL ON SCHEMA ai_assistant_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ai_assistant_private TO service_role;

CREATE TABLE ai_assistant_private.rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);

REVOKE ALL ON TABLE ai_assistant_private.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE ai_assistant_private.rate_limits TO service_role;

CREATE TABLE ai_assistant_private.turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_id uuid,
  question text NOT NULL,
  answer text,
  lookups jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz
);

CREATE INDEX turns_created_at_idx ON ai_assistant_private.turns (created_at);

REVOKE ALL ON TABLE ai_assistant_private.turns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE ai_assistant_private.turns TO service_role;

CREATE OR REPLACE FUNCTION ai_assistant_private.purge_old_turns()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM ai_assistant_private.turns
  WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION ai_assistant_private.purge_old_turns() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_assistant_request(p_question text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  request_time timestamptz := clock_timestamp();
  allowed boolean;
  v_turn_id uuid;
  v_farm_id uuid;
  v_question text;
BEGIN
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  -- Backup retention path. Nightly pg_cron is the primary purge.
  PERFORM ai_assistant_private.purge_old_turns();

  v_question := btrim(coalesce(p_question, ''));
  IF v_question = '' OR char_length(v_question) > 500 THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'invalid question');
  END IF;

  INSERT INTO ai_assistant_private.rate_limits AS current_limit (
    user_id,
    window_started_at,
    request_count
  )
  VALUES (caller_id, request_time, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN (current_limit.window_started_at AT TIME ZONE 'UTC')::date
           = (request_time AT TIME ZONE 'UTC')::date
        THEN current_limit.window_started_at
      ELSE request_time
    END,
    request_count = CASE
      WHEN (current_limit.window_started_at AT TIME ZONE 'UTC')::date
           = (request_time AT TIME ZONE 'UTC')::date
        THEN current_limit.request_count + 1
      ELSE 1
    END
  RETURNING request_count <= 100 INTO allowed;

  IF NOT allowed THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  SELECT farm_id
    INTO v_farm_id
    FROM public.profiles
   WHERE id = caller_id
   LIMIT 1;

  INSERT INTO ai_assistant_private.turns (user_id, farm_id, question)
  VALUES (caller_id, v_farm_id, v_question)
  RETURNING id INTO v_turn_id;

  RETURN jsonb_build_object('allowed', true, 'turn_id', v_turn_id);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_assistant_request(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_assistant_request(text) TO authenticated, service_role;

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
  caller_id uuid := auth.uid();
  v_answer text;
  v_lookups jsonb;
  v_count integer;
BEGIN
  IF caller_id IS NULL OR p_turn_id IS NULL THEN
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
     AND user_id = caller_id
     AND finalized_at IS NULL
     AND created_at > now() - interval '2 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_ai_assistant_turn(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_ai_assistant_turn(uuid, text, jsonb) TO authenticated, service_role;

-- Fail closed if pg_cron cannot schedule the retention job (do not ship
-- an audit table with no purge). Matches rainfall-cron style.
SELECT cron.schedule(
  'ai-assistant-turns-retention',
  '15 6 * * *',
  $$ SELECT ai_assistant_private.purge_old_turns(); $$
);
