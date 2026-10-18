-- Records public.todos, a table that already exists in production (created
-- outside the migration history). Idempotent CREATE-IF-MISSING: running this
-- against production changes nothing. After owner approval, mark it applied
-- in prod with:
--   supabase migration repair --status applied 20260316090200
-- Ends with REVOKE ALL FROM anon because Supabase default privileges grant anon
-- on new public tables. That revoke must hold regardless of where this file
-- runs relative to 20261017041928_apply_missing_safeguards.sql.

CREATE TABLE IF NOT EXISTS public.todos (
    id uuid DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL DEFAULT 'tomorrow',
    completed boolean NOT NULL DEFAULT false,
    latitude double precision,
    longitude double precision,
    image text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT todos_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.todos'::regclass
          AND conname = 'todos_user_id_fkey'
    ) THEN
        ALTER TABLE public.todos
            ADD CONSTRAINT todos_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.todos'::regclass
          AND conname = 'todos_category_check'
    ) THEN
        ALTER TABLE public.todos
            ADD CONSTRAINT todos_category_check
            CHECK (category = ANY (ARRAY['tomorrow'::text, 'this_year'::text]));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.todos'::regclass
          AND conname = 'todos_title_check'
    ) THEN
        ALTER TABLE public.todos
            ADD CONSTRAINT todos_title_check
            CHECK (char_length(title) >= 1 AND char_length(title) <= 200);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.todos'::regclass
          AND conname = 'todos_description_check'
    ) THEN
        ALTER TABLE public.todos
            ADD CONSTRAINT todos_description_check
            CHECK (description IS NULL OR char_length(description) <= 2000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.todos'::regclass
          AND conname = 'todos_image_check'
    ) THEN
        ALTER TABLE public.todos
            ADD CONSTRAINT todos_image_check
            CHECK (image IS NULL OR (image LIKE 'data:image/jpeg;base64,%' AND octet_length(image) <= 1500000));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS todos_user_id_idx ON public.todos USING btree (user_id);

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'todos'
          AND policyname = 'Users manage their own todos'
    ) THEN
        CREATE POLICY "Users manage their own todos"
            ON public.todos
            FOR ALL
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());
    END IF;
END $$;

REVOKE ALL ON TABLE public.todos FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.todos TO authenticated;

DO $$
BEGIN
    IF current_setting('server_version_num')::int >= 170000 THEN
        EXECUTE 'GRANT MAINTAIN ON TABLE public.todos TO authenticated';
    END IF;
END $$;

GRANT ALL ON TABLE public.todos TO service_role;

REVOKE ALL ON TABLE public.todos FROM anon;
