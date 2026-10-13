BEGIN;

-- Preserve the operational audit after the farm and Auth account are removed.
ALTER TABLE public.account_deletion_requests
  ADD COLUMN requested_by uuid,
  ADD COLUMN requested_email text;

UPDATE public.account_deletion_requests AS request
SET requested_by = request.user_id,
    requested_email = users.email
FROM auth.users AS users
WHERE users.id = request.user_id;

ALTER TABLE public.account_deletion_requests
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN farm_id DROP NOT NULL,
  DROP CONSTRAINT account_deletion_requests_user_id_fkey,
  DROP CONSTRAINT account_deletion_requests_farm_id_fkey,
  ADD CONSTRAINT account_deletion_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT account_deletion_requests_farm_id_fkey
    FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE SET NULL;

-- Invoker trigger: no new privileges or client update/cancellation policy.
-- Snapshot the authenticated requester's signed email claim on insert.
-- Operator inserts may supply an email when the service JWT has none.
CREATE FUNCTION public.snapshot_account_deletion_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.requested_by := NEW.user_id;
  NEW.requested_email := COALESCE(auth.jwt() ->> 'email', NEW.requested_email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER snapshot_account_deletion_request
BEFORE INSERT ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.snapshot_account_deletion_request();

COMMIT;
