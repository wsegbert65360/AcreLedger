-- Soft delete for tables whose client SELECT policy hides deleted rows.
--
-- Postgres checks the new row of an UPDATE against the table's SELECT policy.
-- custom_spray_records, work_requests, maintenance_schedules and
-- maintenance_logs require `deleted_at IS NULL` to SELECT, so a client
-- `UPDATE ... SET deleted_at = now()` fails with 42501 (new row violates RLS).
-- County, equipment and cattle already retire rows through definer RPCs;
-- this adds one allowlisted RPC for the remaining tables.
--
-- Idempotent: a row that is already deleted counts as done. Returns the number
-- of requested ids that are now deleted for this farm, so the caller can
-- require an exact count.

CREATE OR REPLACE FUNCTION public.soft_delete_farm_rows(
  p_farm_id uuid,
  p_table text,
  p_ids uuid[],
  p_deleted_at timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_deleted_at timestamptz := least(coalesce(p_deleted_at, now()), now());
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_user_farm_id FROM public.profiles WHERE id = auth.uid();
  IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
    RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
  END IF;
  IF p_table NOT IN ('custom_spray_records', 'work_requests', 'maintenance_schedules', 'maintenance_logs') THEN
    RAISE EXCEPTION 'Table not allowed: %', p_table USING ERRCODE = '22023';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = $1 WHERE farm_id = $2 AND id = ANY($3) AND deleted_at IS NULL',
    p_table
  ) USING v_deleted_at, p_farm_id, p_ids;

  EXECUTE format(
    'SELECT count(DISTINCT id)::int FROM public.%I WHERE farm_id = $1 AND id = ANY($2) AND deleted_at IS NOT NULL',
    p_table
  ) INTO v_count USING p_farm_id, p_ids;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_farm_rows(uuid, text, uuid[], timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_farm_rows(uuid, text, uuid[], timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.soft_delete_farm_rows(uuid, text, uuid[], timestamptz) IS
  'Soft-deletes rows of an allowlisted farm table whose SELECT policy hides deleted rows. Idempotent; returns how many requested ids are now deleted.';
