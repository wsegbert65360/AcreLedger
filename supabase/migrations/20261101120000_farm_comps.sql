-- Service-managed complimentary access metadata only; no access enforcement.
CREATE TABLE IF NOT EXISTS public.farm_comps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id),
  reason text NOT NULL,
  granted_by text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS farm_comps_farm_id_idx ON public.farm_comps(farm_id);
ALTER TABLE public.farm_comps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_comps FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.farm_comps TO service_role;
-- billing_audit_log does not exist in migration history; no audit trigger installed.
-- Retire comps by setting deleted_at, never by deleting rows.
CREATE OR REPLACE FUNCTION public.get_farm_comp_status(p_farm_id uuid)
RETURNS TABLE (is_comped boolean, expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT c.id IS NOT NULL, c.expires_at
  FROM (SELECT 1) AS member
  LEFT JOIN LATERAL (
    SELECT fc.id, fc.expires_at FROM public.farm_comps fc
    WHERE fc.farm_id = p_farm_id AND fc.deleted_at IS NULL
      AND (fc.expires_at IS NULL OR fc.expires_at > now())
    ORDER BY fc.expires_at DESC NULLS FIRST, fc.id
    LIMIT 1
  ) c ON true
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.farm_id = p_farm_id
  );
$$;
REVOKE ALL ON FUNCTION public.get_farm_comp_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_farm_comp_status(uuid) TO authenticated;
