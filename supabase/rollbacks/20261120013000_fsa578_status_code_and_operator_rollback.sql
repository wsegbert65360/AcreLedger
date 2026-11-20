-- Rollback for 20261120013000_fsa578_status_code_and_operator.sql.
-- Drops the manual FSA-578 status codes and operator name/address (data loss for those columns only).
BEGIN;

DROP FUNCTION IF EXISTS public.set_farm_fsa_operator(uuid, text, text);

ALTER TABLE public.farms
  DROP CONSTRAINT IF EXISTS farms_fsa_operator_name_length,
  DROP CONSTRAINT IF EXISTS farms_fsa_operator_address_length,
  DROP COLUMN IF EXISTS fsa_operator_name,
  DROP COLUMN IF EXISTS fsa_operator_address;

ALTER TABLE public.plant_records
  DROP CONSTRAINT IF EXISTS plant_records_fsa_status_code_check,
  DROP COLUMN IF EXISTS fsa_status_code;

COMMIT;
