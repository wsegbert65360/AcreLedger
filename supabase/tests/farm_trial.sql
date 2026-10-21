-- Run with `supabase test db` against a disposable local database only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(12);

INSERT INTO auth.users (id) VALUES ('f1111111-1111-4111-8111-111111111111');
INSERT INTO public.profiles (id) VALUES ('f1111111-1111-4111-8111-111111111111') ON CONFLICT (id) DO NOTHING;
SELECT set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
CREATE TEMP TABLE trial_fixture (id uuid, started timestamptz, ends timestamptz);
INSERT INTO trial_fixture (id) SELECT public.ensure_user_farm();
UPDATE trial_fixture t SET started = f.trial_started_at, ends = f.trial_ends_at FROM public.farms f WHERE f.id = t.id;
SELECT ok((SELECT started IS NOT NULL AND ends = started + interval '3 months' FROM trial_fixture), 'first farm gets calendar-month trial');
SELECT is(public.ensure_user_farm(), (SELECT id FROM trial_fixture), 'repeat onboarding returns same farm');
SELECT is((SELECT count(*)::int FROM public.trial_claims WHERE user_id = auth.uid()), 1, 'one claim per user');
SELECT is((SELECT trial_started_at FROM public.farms WHERE id = (SELECT id FROM trial_fixture)), (SELECT started FROM trial_fixture), 'repeat call preserves dates');

-- Give hostile table grants to prove the trigger protects dates independently
-- of current production privileges. All fixture changes roll back below.
GRANT SELECT ON trial_fixture TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.farms TO authenticated;
CREATE POLICY trial_test_select ON public.farms FOR SELECT TO authenticated USING (true);
CREATE POLICY trial_test_update ON public.farms FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
SET LOCAL ROLE authenticated;
UPDATE public.farms SET trial_ends_at = '2099-01-01' WHERE id = (SELECT id FROM trial_fixture);
RESET ROLE;
SELECT is((SELECT trial_ends_at FROM public.farms WHERE id = (SELECT id FROM trial_fixture)), (SELECT ends FROM trial_fixture), 'client cannot extend trial');
SELECT ok(NOT has_table_privilege('authenticated', 'public.trial_claims', 'INSERT'), 'client cannot claim');
SELECT ok(NOT has_table_privilege('anon', 'public.trial_claims', 'SELECT'), 'anon cannot read claims');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trial_claims'), 0, 'no client policies');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trial_claims'::regclass), 'claims RLS enabled');

UPDATE public.profiles SET farm_id = NULL WHERE id = auth.uid();
SELECT public.ensure_user_farm();
SELECT ok((SELECT trial_started_at IS NULL AND trial_ends_at IS NULL FROM public.farms WHERE id = public.ensure_user_farm()), 'second farm has no trial');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.farm_subscriptions'::regclass AND conname = 'farm_subscriptions_farm_id_fkey'), 'r', 'billing history restricts farm deletion');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.trial_claims'::regclass AND confrelid = 'public.farms'::regclass), 'r', 'claim survives farm deletion attempts');
SELECT * FROM finish();
ROLLBACK;
