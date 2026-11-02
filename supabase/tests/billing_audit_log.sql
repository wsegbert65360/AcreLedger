-- Run with supabase test db against a disposable local database only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(14);
INSERT INTO auth.users (id, email) VALUES ('ba111111-1111-4111-8111-111111111111', 'audit-fixture@example.invalid');
INSERT INTO public.profiles (id) VALUES ('ba111111-1111-4111-8111-111111111111') ON CONFLICT (id) DO NOTHING;
SELECT set_config('request.jwt.claim.sub', 'ba111111-1111-4111-8111-111111111111', true);
CREATE TEMP TABLE audit_fixture (id uuid);
INSERT INTO audit_fixture SELECT public.ensure_user_farm();
GRANT SELECT ON audit_fixture TO authenticated;

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.billing_audit_log'::regclass), 'RLS enabled');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'billing_audit_log'), 0, 'no client policies');
SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_audit_log', 'SELECT'), 'authenticated cannot select');
SELECT ok(NOT has_table_privilege('anon', 'public.billing_audit_log', 'SELECT'), 'anon cannot select');
SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_audit_log', 'INSERT'), 'authenticated cannot insert');
SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_audit_log', 'UPDATE'), 'authenticated cannot update');
SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_audit_log', 'DELETE'), 'authenticated cannot delete');
SELECT ok(NOT has_table_privilege('service_role', 'public.billing_audit_log', 'DELETE'), 'service uses no hard delete');
SELECT ok(NOT has_function_privilege('authenticated', 'public.audit_farm_comps()', 'EXECUTE'), 'authenticated cannot execute trigger function');
SELECT ok(NOT has_function_privilege('anon', 'public.audit_farm_comps()', 'EXECUTE'), 'anon cannot execute trigger function');

INSERT INTO public.farm_comps (farm_id, reason) SELECT id, 'audit fixture' FROM audit_fixture;
SELECT is((SELECT count(*)::int FROM public.billing_audit_log WHERE action = 'insert' AND table_name = 'farm_comps'), 1, 'insert writes one insert row');
UPDATE public.farm_comps SET reason = 'audit fixture updated' WHERE farm_id = (SELECT id FROM audit_fixture) AND deleted_at IS NULL;
SELECT is((SELECT count(*)::int FROM public.billing_audit_log WHERE action = 'update' AND table_name = 'farm_comps'), 1, 'update writes one update row');
UPDATE public.farm_comps SET deleted_at = now() WHERE farm_id = (SELECT id FROM audit_fixture) AND deleted_at IS NULL;
SELECT is((SELECT count(*)::int FROM public.billing_audit_log WHERE action = 'soft_delete' AND table_name = 'farm_comps'), 1, 'soft-delete writes one soft_delete row');
SELECT is((SELECT count(*)::int FROM public.billing_audit_log), 3, 'three audit rows total');

SELECT * FROM finish();
ROLLBACK;
