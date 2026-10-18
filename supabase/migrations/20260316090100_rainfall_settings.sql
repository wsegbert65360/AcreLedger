-- Records public.rainfall_settings, a table that already exists in production
-- (created outside the migration history). Idempotent CREATE-IF-MISSING: running
-- this against production changes nothing. After owner approval, mark it applied
-- in prod with:
--   supabase migration repair --status applied 20260316090100
-- Ends with REVOKE ALL FROM anon because Supabase default privileges grant anon
-- on new public tables. That revoke must hold regardless of where this file
-- runs relative to 20261017041928_apply_missing_safeguards.sql.

CREATE TABLE IF NOT EXISTS public.rainfall_settings (
    farm_id uuid NOT NULL,
    key text NOT NULL,
    value text,
    CONSTRAINT rainfall_settings_pkey PRIMARY KEY (farm_id, key)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.rainfall_settings'::regclass
          AND conname = 'rainfall_settings_farm_id_fkey'
    ) THEN
        ALTER TABLE public.rainfall_settings
            ADD CONSTRAINT rainfall_settings_farm_id_fkey
            FOREIGN KEY (farm_id) REFERENCES public.farms(id) ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE public.rainfall_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'rainfall_settings'
          AND policyname = 'Service role only'
    ) THEN
        CREATE POLICY "Service role only"
            ON public.rainfall_settings
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

REVOKE ALL ON TABLE public.rainfall_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rainfall_settings TO authenticated;

DO $$
BEGIN
    IF current_setting('server_version_num')::int >= 170000 THEN
        EXECUTE 'GRANT MAINTAIN ON TABLE public.rainfall_settings TO authenticated';
    END IF;
END $$;

GRANT ALL ON TABLE public.rainfall_settings TO service_role;

REVOKE ALL ON TABLE public.rainfall_settings FROM anon;
