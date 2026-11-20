-- FSA-578 worksheet: manual box 16 status code on plantings, and the operator
-- name/address printed in box 5. Both are optional and nullable; existing rows
-- are unchanged. Rollback: supabase/rollbacks/20261120013000_fsa578_status_code_and_operator_rollback.sql
BEGIN;

ALTER TABLE public.plant_records
  ADD COLUMN IF NOT EXISTS fsa_status_code text;

ALTER TABLE public.plant_records
  ADD CONSTRAINT plant_records_fsa_status_code_check
  CHECK (fsa_status_code IS NULL OR fsa_status_code IN ('I', 'P', 'F', 'S', 'D', 'R', 'V', 'E', 'IF', 'IP', 'SF', 'DF', 'DP'));

COMMENT ON COLUMN public.plant_records.fsa_status_code IS
  'Optional manual FSA-578 crop status code (box 16). NULL means derive it from crop_status and crop_sequence.';

ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS fsa_operator_name text,
  ADD COLUMN IF NOT EXISTS fsa_operator_address text;

ALTER TABLE public.farms
  ADD CONSTRAINT farms_fsa_operator_name_length CHECK (fsa_operator_name IS NULL OR char_length(fsa_operator_name) <= 200),
  ADD CONSTRAINT farms_fsa_operator_address_length CHECK (fsa_operator_address IS NULL OR char_length(fsa_operator_address) <= 500);

COMMENT ON COLUMN public.farms.fsa_operator_name IS
  'Operator name printed in FSA-578 worksheet box 5. Optional.';
COMMENT ON COLUMN public.farms.fsa_operator_address IS
  'Operator mailing address printed in FSA-578 worksheet box 5. Optional.';

-- Clients cannot write public.farms directly; this RPC is the only write path.
CREATE OR REPLACE FUNCTION public.set_farm_fsa_operator(
  p_farm_id uuid,
  p_name text,
  p_address text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_user_farm_id
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
    RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.farms
  SET fsa_operator_name = NULLIF(btrim(p_name), ''),
      fsa_operator_address = NULLIF(btrim(p_address), '')
  WHERE id = p_farm_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_farm_fsa_operator(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_farm_fsa_operator(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_farm_fsa_operator(uuid, text, text) IS
  'Sets or clears the FSA-578 operator name and address for the caller''s own farm.';

COMMIT;
