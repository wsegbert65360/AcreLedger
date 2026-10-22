-- Trial PR 1: server-owned, calendar-month trial metadata. Enforcement stays OFF.
-- No existing-farm backfill; rollout is a separate, explicitly approved action.
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Private, stable installation salt: never exposed through the Data API or tenant/customer backups.
-- Only the postgres owner of ensure_user_farm can read it (owners/admins retain access).
CREATE SCHEMA IF NOT EXISTS trial_private;
REVOKE ALL ON SCHEMA trial_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS trial_private.identity_salt (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  salt bytea NOT NULL CHECK (octet_length(salt) = 32)
);
ALTER TABLE trial_private.identity_salt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE trial_private.identity_salt FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA trial_private TO postgres;
GRANT SELECT ON TABLE trial_private.identity_salt TO postgres;
INSERT INTO trial_private.identity_salt (singleton, salt)
VALUES (true, sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')))
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.trial_claims (
  identity_hash bytea PRIMARY KEY CHECK (octet_length(identity_hash) = 32),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE RESTRICT,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trial_claims_farm_id_idx ON public.trial_claims(farm_id);
ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;
-- Intentionally no client policies. Claims are billing infrastructure, not farm backup data.
REVOKE ALL ON TABLE public.trial_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.trial_claims TO service_role;

-- SECURITY INVOKER is essential: current_user must reflect the writer.
-- ensure_user_farm runs as its postgres owner, while direct Data API writes run
-- as anon/authenticated. Never trust a client-set custom GUC or JWT role string.
CREATE OR REPLACE FUNCTION public.guard_farm_trial_dates()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.trial_started_at := NULL;
      NEW.trial_ends_at := NULL;
    ELSE
      NEW.trial_started_at := OLD.trial_started_at;
      NEW.trial_ends_at := OLD.trial_ends_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_farm_trial_dates() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_farm_trial_dates ON public.farms;
CREATE TRIGGER guard_farm_trial_dates BEFORE INSERT OR UPDATE ON public.farms
  FOR EACH ROW EXECUTE FUNCTION public.guard_farm_trial_dates();
-- Defense in depth; table-level grants still take precedence over column revokes.
-- The trigger remains authoritative without changing existing table privileges.
REVOKE INSERT (trial_started_at, trial_ends_at), UPDATE (trial_started_at, trial_ends_at)
  ON public.farms FROM PUBLIC, anon, authenticated;

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
    -- Read the authoritative auth identity, never caller-provided JWT metadata.
    -- Prefix a stable secret salt to a domain-separated, trimmed/case-folded email.
    -- No email means no trial; fail closed rather than fall back to a replaceable UUID.
    SELECT sha256(s.salt || convert_to('acreledger:trial:v1:email:' || lower(btrim(u.email)), 'UTF8'))
    INTO v_identity_hash
    FROM auth.users u CROSS JOIN trial_private.identity_salt s
    WHERE u.id = v_user_id AND nullif(btrim(u.email), '') IS NOT NULL;
    IF v_identity_hash IS NULL THEN
      RAISE EXCEPTION 'An email identity is required to start a farm.';
    END IF;

    INSERT INTO public.farms (name)
    VALUES ('My Farm')
    RETURNING id INTO v_farm_id;

    -- The profile FOR UPDATE lock serializes onboarding for this user.
    -- Unique identity conflicts also serialize different accounts using the same email.
    INSERT INTO public.trial_claims (identity_hash, user_id, farm_id)
    VALUES (v_identity_hash, v_user_id, v_farm_id)
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      UPDATE public.farms
      SET trial_started_at = now(), trial_ends_at = now() + interval '3 months'
      WHERE id = v_farm_id;
    END IF;

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

ALTER FUNCTION public.ensure_user_farm() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_user_farm() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_farm() TO authenticated;

-- Preserve billing history even if an operator attempts a farm hard delete.
DO $fk$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.farm_subscriptions'::regclass
      AND c.confrelid = 'public.farms'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = c.conrelid AND attname = 'farm_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.farm_subscriptions DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.farm_subscriptions ADD CONSTRAINT farm_subscriptions_farm_id_fkey
    FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE RESTRICT;
END;
$fk$;

/* ROLLBACK (manual, never automatically executed; removes trial metadata/claims):
BEGIN;
DROP TRIGGER IF EXISTS guard_farm_trial_dates ON public.farms;
DROP FUNCTION IF EXISTS public.guard_farm_trial_dates();
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
DROP TABLE IF EXISTS public.trial_claims;
DROP TABLE IF EXISTS trial_private.identity_salt;
DROP SCHEMA IF EXISTS trial_private;
ALTER TABLE public.farms DROP COLUMN IF EXISTS trial_started_at;
ALTER TABLE public.farms DROP COLUMN IF EXISTS trial_ends_at;
DO $fk$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.farm_subscriptions'::regclass
      AND c.confrelid = 'public.farms'::regclass
      AND c.contype = 'f'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = c.conrelid AND attname = 'farm_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.farm_subscriptions DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.farm_subscriptions ADD CONSTRAINT farm_subscriptions_farm_id_fkey
    FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE CASCADE;
END;
$fk$;
COMMIT;
*/
