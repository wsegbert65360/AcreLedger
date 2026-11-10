-- Manual rollback for 20261102041847_billing_audit_log.sql.
-- Never auto-executed. Drops the farm_comps audit trigger, function, and table.
DROP TRIGGER IF EXISTS farm_comps_billing_audit ON public.farm_comps;
DROP FUNCTION IF EXISTS public.audit_farm_comps();
DROP TABLE IF EXISTS public.billing_audit_log;
