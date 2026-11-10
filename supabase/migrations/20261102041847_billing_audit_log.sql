-- Service-managed billing audit for farm_comps. No client access. No seed data.
-- Soft delete only: AFTER INSERT OR UPDATE, never DELETE.
CREATE TABLE IF NOT EXISTS public.billing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id),
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'soft_delete')),
  old_row jsonb,
  new_row jsonb,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_audit_log_farm_id_created_at_idx
  ON public.billing_audit_log (farm_id, created_at);

ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.billing_audit_log TO service_role;

COMMENT ON TABLE public.billing_audit_log IS
  'Service-role billing audit. farm_comps insert/update/soft-delete only; never exposed to clients.';

CREATE OR REPLACE FUNCTION public.audit_farm_comps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
  v_actor text;
BEGIN
  v_actor := COALESCE(
    auth.uid()::text,
    NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    CURRENT_USER
  );

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    INSERT INTO public.billing_audit_log (farm_id, table_name, action, old_row, new_row, actor)
    VALUES (NEW.farm_id, TG_TABLE_NAME, v_action, NULL, pg_catalog.to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'soft_delete';
  ELSE
    v_action := 'update';
  END IF;

  INSERT INTO public.billing_audit_log (farm_id, table_name, action, old_row, new_row, actor)
  VALUES (NEW.farm_id, TG_TABLE_NAME, v_action, pg_catalog.to_jsonb(OLD), pg_catalog.to_jsonb(NEW), v_actor);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_farm_comps() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS farm_comps_billing_audit ON public.farm_comps;
CREATE TRIGGER farm_comps_billing_audit
  AFTER INSERT OR UPDATE ON public.farm_comps
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_farm_comps();
