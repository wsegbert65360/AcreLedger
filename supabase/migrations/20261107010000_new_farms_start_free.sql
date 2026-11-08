-- Free tier, Phase 2: new farms start on the free tier (no trial) once entitlements_mode() <> 'off'.
-- While mode = 'off' (default) this function behaves exactly as before: 3-month trial + trial_claims.
-- Existing farms and trial_claims are untouched. Nothing is deleted.
CREATE OR REPLACE FUNCTION public.ensure_user_farm()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
  v_identity_hash bytea;
  v_start_free boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT farm_id
  INTO v_farm_id
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for current user.';
  END IF;

  IF v_farm_id IS NULL THEN
    v_start_free := public.entitlements_mode() <> 'off';

    IF NOT v_start_free THEN
      -- Legacy trial path (mode off): identity hash from the authoritative auth email.
      SELECT sha256(s.salt || convert_to('acreledger:trial:v1:email:' || lower(btrim(u.email)), 'UTF8'))
      INTO v_identity_hash
      FROM auth.users u CROSS JOIN trial_private.identity_salt s
      WHERE u.id = v_user_id AND nullif(btrim(u.email), '') IS NOT NULL;
      IF v_identity_hash IS NULL THEN
        RAISE EXCEPTION 'An email identity is required to start a farm.';
      END IF;
    END IF;

    INSERT INTO public.farms (name)
    VALUES ('My Farm')
    RETURNING id INTO v_farm_id;

    IF NOT v_start_free THEN
      INSERT INTO public.trial_claims (identity_hash, user_id, farm_id)
      VALUES (v_identity_hash, v_user_id, v_farm_id)
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        UPDATE public.farms
        SET trial_started_at = now(), trial_ends_at = now() + interval '3 months'
        WHERE id = v_farm_id;
      END IF;
    END IF;

    UPDATE public.profiles
    SET farm_id = v_farm_id,
        active_season = COALESCE(active_season, EXTRACT(YEAR FROM now())::int)
    WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET active_season = EXTRACT(YEAR FROM now())::int
    WHERE id = v_user_id AND active_season IS NULL;
  END IF;

  RETURN v_farm_id;
END;
$$;

ALTER FUNCTION public.ensure_user_farm() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_user_farm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_farm() TO authenticated;
