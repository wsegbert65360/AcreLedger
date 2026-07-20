-- Protect profile farm membership
-- A signed-in client must not be able to change farm membership (farm_id / id)
-- through the Data API. Profile rows are created by handle_new_user and farm
-- linkage is owned by ensure_user_farm() (SECURITY DEFINER). Clients may only
-- read their own profile and update active_season / onboarding_complete.

-- 1. Drop every existing profile policy (including legacy permissive ones that
-- only exist on some environments: "Profile Isolation", insert/view variants).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- Named drops for migration readability / idempotency on fresh databases.
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profile Isolation" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile season and onboarding" ON public.profiles;

-- 2. Revoke direct profile mutations from authenticated clients
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

-- 3. Restore only the privileges the client currently needs
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (active_season, onboarding_complete) ON public.profiles TO authenticated;

-- 4. Separate SELECT / UPDATE policies (no INSERT or DELETE policies)
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile season and onboarding"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 5. Preserve full service_role access for backups/admin/RPCs
GRANT ALL ON TABLE public.profiles TO service_role;

-- ensure_user_farm() remains the sole client-callable path that assigns farm_id
-- (SECURITY DEFINER). Do not re-grant authenticated UPDATE on farm_id or id.
