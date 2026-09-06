BEGIN;

-- Full keys are required by the services, offline replay, and backup restore.
-- Lock before checking so concurrent writes cannot introduce duplicate history.
LOCK TABLE public.fsa_tract_imports, public.field_clu_assignments IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.fsa_tract_imports
        GROUP BY farm_id, tract_key HAVING count(*) > 1
    ) OR EXISTS (
        SELECT 1 FROM public.field_clu_assignments
        GROUP BY farm_id, tract_key, clu_number HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot restore FSA/CLU unique keys: duplicate historical keys require manual review. No records have been changed.';
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.fsa_tract_imports'::regclass
          AND conname = 'fsa_tract_imports_farm_id_tract_key_key'
    ) THEN
        DROP INDEX IF EXISTS public.fsa_tract_imports_farm_tract_key;
        ALTER TABLE public.fsa_tract_imports
            ADD CONSTRAINT fsa_tract_imports_farm_id_tract_key_key UNIQUE (farm_id, tract_key);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.field_clu_assignments'::regclass
          AND conname = 'field_clu_assignments_farm_id_tract_key_clu_number_key'
    ) THEN
        DROP INDEX IF EXISTS public.field_clu_assignments_farm_id_tract_key_clu_number_key;
        ALTER TABLE public.field_clu_assignments
            ADD CONSTRAINT field_clu_assignments_farm_id_tract_key_clu_number_key
            UNIQUE (farm_id, tract_key, clu_number);
    END IF;
END;
$$;

-- These two reference tables intentionally support resurrection by upsert.
-- PostgreSQL also checks SELECT visibility of the conflicting old row; hiding
-- tombstones here would still reject resurrection even with UPDATE allowed.
-- Keep visibility strictly within the caller's farm. Application reads already
-- explicitly filter deleted_at IS NULL. Other tables retain their restrictions.
DROP POLICY fsa_tract_imports_select ON public.fsa_tract_imports;
CREATE POLICY fsa_tract_imports_select ON public.fsa_tract_imports
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
DROP POLICY field_clu_assignments_select ON public.field_clu_assignments;
CREATE POLICY field_clu_assignments_select ON public.field_clu_assignments
    FOR SELECT TO authenticated USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.fsa_tract_imports;
DROP POLICY IF EXISTS "Restrict updates on deleted rows" ON public.field_clu_assignments;
-- Existing UPDATE USING/WITH CHECK policies enforce the caller's farm on both
-- old and new rows, and require an active same-farm field for CLU assignments.

COMMIT;
