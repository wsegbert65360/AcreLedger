-- Run with `supabase test db` against a disposable local database only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(4);

SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'profiles_id_fkey'
    AND conrelid = 'public.profiles'::regclass
    AND confrelid = 'auth.users'::regclass
    AND contype = 'f'
    AND confdeltype = 'c'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.profiles'::regclass AND attname = 'id')]
    AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
      WHERE attrelid = 'auth.users'::regclass AND attname = 'id')]
), 'profiles.id references auth.users.id with ON DELETE CASCADE');

INSERT INTO auth.users (id, email)
VALUES ('f3333333-3333-4333-8333-333333333333', 'profiles-fk-fixture@example.invalid');
INSERT INTO public.farms (id, name)
VALUES ('f4444444-4444-4444-8444-444444444444', 'Profile FK fixture');
-- The signup trigger may already have created the profile.
INSERT INTO public.profiles (id)
VALUES ('f3333333-3333-4333-8333-333333333333') ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET farm_id = 'f4444444-4444-4444-8444-444444444444'
WHERE id = 'f3333333-3333-4333-8333-333333333333';
SELECT is((SELECT farm_id FROM public.profiles
  WHERE id = 'f3333333-3333-4333-8333-333333333333'),
  'f4444444-4444-4444-8444-444444444444'::uuid, 'fixture profile belongs to the farm');

DELETE FROM auth.users WHERE id = 'f3333333-3333-4333-8333-333333333333';
SELECT is((SELECT count(*)::int FROM public.profiles
  WHERE id = 'f3333333-3333-4333-8333-333333333333'), 0, 'Auth deletion removes the profile');
SELECT is((SELECT count(*)::int FROM public.farms
  WHERE id = 'f4444444-4444-4444-8444-444444444444'), 1, 'Auth deletion preserves the farm');

SELECT * FROM finish();
ROLLBACK;
