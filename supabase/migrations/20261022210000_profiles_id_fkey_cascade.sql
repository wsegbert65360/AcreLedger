-- Production had profiles_id_fkey without an ON DELETE action, but the FK was
-- absent from repository migrations. It blocks deletion of the Auth user.
-- Nothing references public.profiles and profiles has no DELETE triggers, so
-- this cascade removes only the profile row. Farms remain untouched, and
-- profiles_farm_id_fkey stays RESTRICT.
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;

/* ROLLBACK
BEGIN;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id);
COMMIT;
*/
