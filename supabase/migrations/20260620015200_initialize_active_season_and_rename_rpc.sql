-- ===========================================================================
-- Onboarding Enhancements Migration
-- Purpose: Initialize active_season on user profiles & add rename RPC for farms
-- ===========================================================================

-- 1. Redefine ensure_user_farm to write default active_season on creation or sync
CREATE OR REPLACE FUNCTION public.ensure_user_farm()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
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
    INSERT INTO public.farms (name)
    VALUES ('My Farm')
    RETURNING id INTO v_farm_id;

    UPDATE public.profiles
    SET farm_id = v_farm_id,
        active_season = COALESCE(active_season, EXTRACT(YEAR FROM now())::int)
    WHERE id = v_user_id;
  ELSE
    -- If user already has a farm but active_season is NULL, initialize it
    UPDATE public.profiles
    SET active_season = EXTRACT(YEAR FROM now())::int
    WHERE id = v_user_id AND active_season IS NULL;
  END IF;

  RETURN v_farm_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_farm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_farm() TO authenticated;

-- 2. Define update_farm_name SECURITY DEFINER function to bypass client farms write restriction
CREATE OR REPLACE FUNCTION public.update_farm_name(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Farm name cannot be empty.';
  END IF;

  SELECT farm_id INTO v_farm_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm associated with this user.';
  END IF;

  UPDATE public.farms
  SET name = trim(p_name)
  WHERE id = v_farm_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_farm_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_farm_name(text) TO authenticated;

-- 3. Backfill any existing user profiles missing active_season
UPDATE public.profiles
SET active_season = EXTRACT(YEAR FROM now())::int
WHERE active_season IS NULL;
