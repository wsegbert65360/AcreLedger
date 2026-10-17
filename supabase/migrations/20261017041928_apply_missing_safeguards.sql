-- Apply missing production safeguards (audit 2026-10-17).
--
-- Purpose: consolidates three migrations that exist in this repo but were
-- NEVER applied in production:
--   20260825213000_unique_active_grain_movement_per_harvest.sql
--   20260922120000_tenant_scope_harvest_grain_fk.sql
--   20260928233016_revoke_anon_select_core_farm_tables.sql
--
-- Do NOT apply until Will approves. Take a manual backup first.
-- Section A pre-checks fail closed and abort this transaction.
--
-- Fully idempotent: a second run is a no-op when the existing index, unique
-- key, and foreign key match these definitions. A mismatched object raises
-- 42809 instead of being rebuilt. A fresh replay (supabase db reset /
-- verify:migrations) where the three old files already ran is also a no-op.
--
-- Locking decision (team, 2026-10-17): keep ONE explicit transaction, no
-- CREATE INDEX CONCURRENTLY, no file split. Recent Supabase CLI releases can
-- run CONCURRENTLY standalone outside the batch (supabase/cli#5156, #5671),
-- but then a failure leaves earlier statements applied; all-or-nothing is
-- worth more here. Prod tables are tiny (116 grain_movements, 97
-- harvest_records rows), so the SHARE / ACCESS EXCLUSIVE locks last
-- milliseconds. lock_timeout 5s makes the migration fail fast and roll back
-- cleanly instead of queueing behind app traffic (just retry later);
-- statement_timeout 60s bounds any scan. The explicit BEGIN guarantees
-- SET LOCAL takes effect even if the CLI pipelines statements without a
-- transaction block (supabase/cli#6347). The FK is added NOT VALID and then
-- VALIDATEd as a separate statement (VALIDATE takes SHARE UPDATE EXCLUSIVE
-- on grain_movements), though both commit together.
--
-- After applying in production, mark the three old versions applied:
--   supabase migration repair --status applied 20260825213000
--   supabase migration repair --status applied 20260922120000
--   supabase migration repair --status applied 20260928233016
--
-- ROLLBACK SQL (only after this transaction has committed).
-- These are exactly prod's pre-migration anon grants
-- (verified read-only on FarmFlow2 2026-10-17).
--
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- DROP INDEX IF EXISTS public.idx_grain_movements_one_active_per_harvest;
-- ALTER TABLE public.grain_movements
--   DROP CONSTRAINT IF EXISTS grain_movements_farm_harvest_fkey;
-- ALTER TABLE public.harvest_records
--   DROP CONSTRAINT IF EXISTS harvest_records_farm_id_id_key;
-- ALTER TABLE public.grain_movements
--   DROP CONSTRAINT IF EXISTS grain_movements_harvest_record_id_fkey;
-- ALTER TABLE public.grain_movements
--   ADD CONSTRAINT grain_movements_harvest_record_id_fkey
--   FOREIGN KEY (harvest_record_id) REFERENCES public.harvest_records(id)
--   ON DELETE SET NULL;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON
--   public.fields,
--   public.bins,
--   public.plant_records,
--   public.spray_records,
--   public.harvest_records,
--   public.hay_harvest_records,
--   public.fertilizer_applications,
--   public.tillage_records,
--   public.grain_movements,
--   public.saved_seeds,
--   public.fertilizer_recipes,
--   public.spray_recipes
--   TO anon;
-- DO $$
-- DECLARE
--   t text;
--   optional_tables text[] := ARRAY[
--     'rainfall_settings',
--     'todos',
--     'farm_subscriptions'
--   ];
-- BEGIN
--   FOREACH t IN ARRAY optional_tables LOOP
--     IF to_regclass('public.' || t) IS NULL THEN
--       CONTINUE;
--     END IF;
--     IF t = 'farm_subscriptions' THEN
--       EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
--     ELSE
--       EXECUTE format(
--         'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon',
--         t
--       );
--     END IF;
--   END LOOP;
-- END $$;
-- COMMIT;

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Section A: pre-checks (run first, before any change). Fail closed.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_dup_count bigint;
  v_example_harvest uuid;
BEGIN
  SELECT count(*)
  INTO v_dup_count
  FROM (
    SELECT harvest_record_id
    FROM public.grain_movements
    WHERE harvest_record_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY harvest_record_id
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    SELECT harvest_record_id
    INTO v_example_harvest
    FROM public.grain_movements
    WHERE harvest_record_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY harvest_record_id
    HAVING COUNT(*) > 1
    ORDER BY harvest_record_id
    LIMIT 1;

    RAISE EXCEPTION
      'Cannot create unique active harvest_record_id index: % harvest_record_id value(s) have duplicate active grain_movements; example harvest_record_id %',
      v_dup_count,
      v_example_harvest;
  END IF;
END $$;

DO $$
DECLARE
  v_bad_count bigint;
  v_example_grain uuid;
BEGIN
  SELECT count(*)
  INTO v_bad_count
  FROM public.grain_movements gm
  WHERE gm.harvest_record_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.harvest_records hr
      WHERE hr.id = gm.harvest_record_id
        AND hr.farm_id = gm.farm_id
    );

  IF v_bad_count > 0 THEN
    SELECT gm.id
    INTO v_example_grain
    FROM public.grain_movements gm
    WHERE gm.harvest_record_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.harvest_records hr
        WHERE hr.id = gm.harvest_record_id
          AND hr.farm_id = gm.farm_id
      )
    ORDER BY gm.id
    LIMIT 1;

    RAISE EXCEPTION
      'Cannot farm-scope harvest/grain relationship: % invalid link(s); example grain_movement id %',
      v_bad_count,
      v_example_grain
      USING ERRCODE = '23503';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Section B: unique active grain movement per harvest
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_idx regclass;
  v_gm oid := 'public.grain_movements'::regclass;
  v_harvest_att smallint;
  v_pred text;
  v_def text;
  v_ok boolean;
BEGIN
  SELECT a.attnum
  INTO v_harvest_att
  FROM pg_attribute a
  WHERE a.attrelid = v_gm
    AND a.attname = 'harvest_record_id'
    AND NOT a.attisdropped;

  v_idx := to_regclass('public.idx_grain_movements_one_active_per_harvest');

  IF v_idx IS NOT NULL THEN
    SELECT
      pg_get_expr(i.indpred, i.indrelid),
      pg_get_indexdef(i.indexrelid),
      (
        i.indrelid = v_gm
        AND i.indisunique
        AND i.indisvalid
        AND i.indisready
        AND i.indnatts = 1
        AND i.indexprs IS NULL
        AND string_to_array(i.indkey::text, ' ')::smallint[] = ARRAY[v_harvest_att]::smallint[]
      )
    INTO v_pred, v_def, v_ok
    FROM pg_index i
    WHERE i.indexrelid = v_idx;

    IF v_harvest_att IS NULL
       OR NOT FOUND
       OR NOT COALESCE(v_ok, false)
       OR v_pred IS DISTINCT FROM '((harvest_record_id IS NOT NULL) AND (deleted_at IS NULL))'
       OR v_def IS NULL
       OR v_def NOT LIKE 'CREATE UNIQUE INDEX%'
    THEN
      RAISE EXCEPTION
        'Index public.idx_grain_movements_one_active_per_harvest exists with an unexpected definition: %',
        COALESCE(v_def, '<no pg_index row>')
        USING ERRCODE = '42809';
    END IF;
  ELSE
    CREATE UNIQUE INDEX idx_grain_movements_one_active_per_harvest
      ON public.grain_movements (harvest_record_id)
      WHERE harvest_record_id IS NOT NULL AND deleted_at IS NULL;
  END IF;
END $$;

COMMENT ON INDEX public.idx_grain_movements_one_active_per_harvest IS
  'At most one non-deleted grain_movements row may reference a given harvest_record_id (prevents double-count IN rows).';

-- ---------------------------------------------------------------------------
-- Section C: tenant-scoped harvest/grain foreign key
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_hr oid := 'public.harvest_records'::regclass;
  v_farm_att smallint;
  v_id_att smallint;
  v_count bigint;
  v_contype "char";
  v_conrelid oid;
  v_conkey smallint[];
  v_convalidated boolean;
  v_idx_valid boolean;
  v_idx_unique boolean;
BEGIN
  SELECT a.attnum
  INTO v_farm_att
  FROM pg_attribute a
  WHERE a.attrelid = v_hr
    AND a.attname = 'farm_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_id_att
  FROM pg_attribute a
  WHERE a.attrelid = v_hr
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_farm_att IS NULL OR v_id_att IS NULL THEN
    RAISE EXCEPTION
      'harvest_records is missing farm_id or id'
      USING ERRCODE = '42809';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM pg_constraint c
  WHERE c.conname = 'harvest_records_farm_id_id_key'
    AND c.connamespace = 'public'::regnamespace;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Constraint harvest_records_farm_id_id_key exists more than once in schema public'
      USING ERRCODE = '42809';
  ELSIF v_count = 1 THEN
    SELECT c.contype,
           c.conrelid,
           c.conkey::smallint[],
           c.convalidated,
           i.indisvalid,
           i.indisunique
    INTO v_contype, v_conrelid, v_conkey, v_convalidated, v_idx_valid, v_idx_unique
    FROM pg_constraint c
    LEFT JOIN pg_index i ON i.indexrelid = c.conindid
    WHERE c.conname = 'harvest_records_farm_id_id_key'
      AND c.connamespace = 'public'::regnamespace;

    IF v_contype IS DISTINCT FROM 'u'
       OR v_conrelid IS DISTINCT FROM v_hr
       OR v_conkey IS DISTINCT FROM ARRAY[v_farm_att, v_id_att]::smallint[]
       OR v_convalidated IS DISTINCT FROM true
       OR v_idx_valid IS DISTINCT FROM true
       OR v_idx_unique IS DISTINCT FROM true
    THEN
      RAISE EXCEPTION
        'Constraint harvest_records_farm_id_id_key exists with an unexpected definition'
        USING ERRCODE = '42809';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = v_hr
      AND c.contype IN ('p', 'u')
      AND c.conkey::smallint[] = ARRAY[v_farm_att, v_id_att]::smallint[]
  ) THEN
    ALTER TABLE public.harvest_records
      ADD CONSTRAINT harvest_records_farm_id_id_key UNIQUE (farm_id, id);
  END IF;
END $$;

DO $$
DECLARE
  v_gm oid := 'public.grain_movements'::regclass;
  v_hr oid := 'public.harvest_records'::regclass;
  v_gm_farm smallint;
  v_gm_harvest smallint;
  v_hr_farm smallint;
  v_hr_id smallint;
  v_count bigint;
  v_contype "char";
  v_conrelid oid;
  v_confrelid oid;
  v_conkey smallint[];
  v_confkey smallint[];
  v_confdeltype "char";
  v_old record;
BEGIN
  SELECT a.attnum
  INTO v_gm_farm
  FROM pg_attribute a
  WHERE a.attrelid = v_gm
    AND a.attname = 'farm_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_gm_harvest
  FROM pg_attribute a
  WHERE a.attrelid = v_gm
    AND a.attname = 'harvest_record_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_hr_farm
  FROM pg_attribute a
  WHERE a.attrelid = v_hr
    AND a.attname = 'farm_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_hr_id
  FROM pg_attribute a
  WHERE a.attrelid = v_hr
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  IF v_gm_farm IS NULL OR v_gm_harvest IS NULL
     OR v_hr_farm IS NULL OR v_hr_id IS NULL THEN
    RAISE EXCEPTION
      'grain_movements or harvest_records is missing a column required by grain_movements_farm_harvest_fkey'
      USING ERRCODE = '42809';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM pg_constraint c
  WHERE c.conname = 'grain_movements_farm_harvest_fkey'
    AND c.connamespace = 'public'::regnamespace;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Constraint grain_movements_farm_harvest_fkey exists more than once in schema public'
      USING ERRCODE = '42809';
  ELSIF v_count = 1 THEN
    SELECT c.contype,
           c.conrelid,
           c.confrelid,
           c.conkey::smallint[],
           c.confkey::smallint[],
           c.confdeltype
    INTO v_contype, v_conrelid, v_confrelid, v_conkey, v_confkey, v_confdeltype
    FROM pg_constraint c
    WHERE c.conname = 'grain_movements_farm_harvest_fkey'
      AND c.connamespace = 'public'::regnamespace;

    IF v_contype IS DISTINCT FROM 'f'
       OR v_conrelid IS DISTINCT FROM v_gm
       OR v_confrelid IS DISTINCT FROM v_hr
       OR v_conkey IS DISTINCT FROM ARRAY[v_gm_farm, v_gm_harvest]::smallint[]
       OR v_confkey IS DISTINCT FROM ARRAY[v_hr_farm, v_hr_id]::smallint[]
       OR v_confdeltype IS DISTINCT FROM 'r'
    THEN
      RAISE EXCEPTION
        'Constraint grain_movements_farm_harvest_fkey exists with an unexpected definition'
        USING ERRCODE = '42809';
    END IF;
  ELSE
    FOR v_old IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = v_gm
        AND c.confrelid = v_hr
        AND c.conkey::smallint[] = ARRAY[v_gm_harvest]::smallint[]
    LOOP
      EXECUTE format(
        'ALTER TABLE public.grain_movements DROP CONSTRAINT %I',
        v_old.conname
      );
    END LOOP;

    ALTER TABLE public.grain_movements
      ADD CONSTRAINT grain_movements_farm_harvest_fkey
      FOREIGN KEY (farm_id, harvest_record_id)
      REFERENCES public.harvest_records (farm_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

-- VALIDATE is separate from ADD ... NOT VALID and runs only when needed.
DO $$
DECLARE
  v_validated boolean;
BEGIN
  SELECT c.convalidated
  INTO v_validated
  FROM pg_constraint c
  WHERE c.conname = 'grain_movements_farm_harvest_fkey'
    AND c.connamespace = 'public'::regnamespace
    AND c.conrelid = 'public.grain_movements'::regclass;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Constraint grain_movements_farm_harvest_fkey is missing before validation'
      USING ERRCODE = '42809';
  END IF;

  IF NOT v_validated THEN
    ALTER TABLE public.grain_movements
      VALIDATE CONSTRAINT grain_movements_farm_harvest_fkey;
  END IF;
END $$;

DO $$
DECLARE
  v_gm oid := 'public.grain_movements'::regclass;
  v_hr oid := 'public.harvest_records'::regclass;
  v_idx regclass;
  v_gm_farm smallint;
  v_gm_harvest smallint;
  v_hr_farm smallint;
  v_hr_id smallint;
  v_pred text;
  v_ok boolean;
BEGIN
  SELECT a.attnum
  INTO v_gm_farm
  FROM pg_attribute a
  WHERE a.attrelid = v_gm
    AND a.attname = 'farm_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_gm_harvest
  FROM pg_attribute a
  WHERE a.attrelid = v_gm
    AND a.attname = 'harvest_record_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_hr_farm
  FROM pg_attribute a
  WHERE a.attrelid = v_hr
    AND a.attname = 'farm_id'
    AND NOT a.attisdropped;

  SELECT a.attnum
  INTO v_hr_id
  FROM pg_attribute a
  WHERE a.attrelid = v_hr
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  v_idx := to_regclass('public.idx_grain_movements_one_active_per_harvest');

  SELECT
    pg_get_expr(i.indpred, i.indrelid),
    (
      i.indrelid = v_gm
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indnatts = 1
      AND i.indexprs IS NULL
      AND string_to_array(i.indkey::text, ' ')::smallint[] = ARRAY[v_gm_harvest]::smallint[]
    )
  INTO v_pred, v_ok
  FROM pg_index i
  WHERE i.indexrelid = v_idx;

  IF v_idx IS NULL
     OR NOT FOUND
     OR NOT COALESCE(v_ok, false)
     OR v_pred IS DISTINCT FROM '((harvest_record_id IS NOT NULL) AND (deleted_at IS NULL))'
  THEN
    RAISE EXCEPTION
      'Index public.idx_grain_movements_one_active_per_harvest is missing or not a valid unique index'
      USING ERRCODE = '42809';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_index i ON i.indexrelid = c.conindid
    WHERE c.conrelid = v_hr
      AND c.contype IN ('p', 'u')
      AND c.conkey::smallint[] = ARRAY[v_hr_farm, v_hr_id]::smallint[]
      AND c.convalidated
      AND i.indisvalid
      AND i.indisunique
  ) THEN
    RAISE EXCEPTION
      'Unique key on harvest_records (farm_id, id) is missing'
      USING ERRCODE = '42809';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'grain_movements_farm_harvest_fkey'
      AND c.connamespace = 'public'::regnamespace
      AND c.contype = 'f'
      AND c.conrelid = v_gm
      AND c.confrelid = v_hr
      AND c.conkey::smallint[] = ARRAY[v_gm_farm, v_gm_harvest]::smallint[]
      AND c.confkey::smallint[] = ARRAY[v_hr_farm, v_hr_id]::smallint[]
      AND c.confdeltype = 'r'
      AND c.convalidated
  ) THEN
    RAISE EXCEPTION
      'Constraint grain_movements_farm_harvest_fkey is missing or not validated'
      USING ERRCODE = '42809';
  END IF;
END $$;

COMMENT ON CONSTRAINT grain_movements_farm_harvest_fkey
  ON public.grain_movements IS
  'A linked grain movement and its harvest must belong to the same farm. Harvest lifecycle uses soft deletion; hard deletion is restricted.';

-- ---------------------------------------------------------------------------
-- Section D: revoke anon on the 12 core farm-owned tables (tables must exist)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  core_farm_tables text[] := ARRAY[
    'fields',
    'bins',
    'plant_records',
    'spray_records',
    'harvest_records',
    'hay_harvest_records',
    'fertilizer_applications',
    'tillage_records',
    'grain_movements',
    'saved_seeds',
    'fertilizer_recipes',
    'spray_recipes'
  ];
BEGIN
  FOREACH t IN ARRAY core_farm_tables LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;

  FOREACH t IN ARRAY core_farm_tables LOOP
    IF has_table_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE, DELETE')
       OR has_any_column_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE') THEN
      RAISE EXCEPTION 'anon still has privileges on public.%', t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- OPTIONAL Section E
-- Will can keep or drop this section independently; deleting it does not
-- affect sections A-D.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  optional_tables text[] := ARRAY[
    'rainfall_settings',
    'todos',
    'farm_subscriptions'
  ];
BEGIN
  FOREACH t IN ARRAY optional_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
  END LOOP;

  FOREACH t IN ARRAY optional_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    IF has_table_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE, DELETE')
       OR has_any_column_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE') THEN
      RAISE EXCEPTION 'anon still has privileges on public.%', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
