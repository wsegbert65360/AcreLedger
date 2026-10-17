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
-- Fully idempotent: a second run is a no-op, and a fresh replay
-- (supabase db reset / verify:migrations) where the three old files already
-- ran is also a no-op.
--
-- After applying in production, mark the three old versions applied:
--   supabase migration repair --status applied 20260825213000
--   supabase migration repair --status applied 20260922120000
--   supabase migration repair --status applied 20260928233016
--
-- ROLLBACK SQL (only after this transaction has committed):
--   DROP INDEX IF EXISTS public.idx_grain_movements_one_active_per_harvest;
--   ALTER TABLE public.grain_movements
--     DROP CONSTRAINT IF EXISTS grain_movements_farm_harvest_fkey;
--   ALTER TABLE public.harvest_records
--     DROP CONSTRAINT IF EXISTS harvest_records_farm_id_id_key;
--   ALTER TABLE public.grain_movements
--     ADD CONSTRAINT grain_movements_harvest_record_id_fkey
--     FOREIGN KEY (harvest_record_id) REFERENCES public.harvest_records(id)
--     ON DELETE SET NULL;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON
--     public.fields,
--     public.bins,
--     public.plant_records,
--     public.spray_records,
--     public.harvest_records,
--     public.hay_harvest_records,
--     public.fertilizer_applications,
--     public.tillage_records,
--     public.grain_movements,
--     public.saved_seeds,
--     public.fertilizer_recipes,
--     public.spray_recipes
--     TO anon;
--   -- optional Section E tables (only if that section ran):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.rainfall_settings, public.todos TO anon;
--   GRANT SELECT ON public.farm_subscriptions TO anon;

BEGIN;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_grain_movements_one_active_per_harvest
  ON public.grain_movements (harvest_record_id)
  WHERE harvest_record_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_grain_movements_one_active_per_harvest IS
  'At most one non-deleted grain_movements row may reference a given harvest_record_id (prevents double-count IN rows).';

-- ---------------------------------------------------------------------------
-- Section C: tenant-scoped harvest/grain foreign key
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.harvest_records'::regclass
      AND conname = 'harvest_records_farm_id_id_key'
      AND NOT (
        contype = 'u'
        AND conkey = ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.harvest_records'::regclass AND attname = 'farm_id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.harvest_records'::regclass AND attname = 'id')
        ]::smallint[]
      )
  ) THEN
    RAISE EXCEPTION
      'Constraint harvest_records_farm_id_id_key exists with an unexpected definition'
      USING ERRCODE = '42809';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.harvest_records'::regclass
      AND contype IN ('p', 'u')
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.harvest_records'::regclass AND attname = 'farm_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.harvest_records'::regclass AND attname = 'id')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.harvest_records
      ADD CONSTRAINT harvest_records_farm_id_id_key UNIQUE (farm_id, id);
  END IF;
END $$;

DO $$
DECLARE
  v_constraint record;
  v_deltype text;
BEGIN
  SELECT c.confdeltype::text
  INTO v_deltype
  FROM pg_constraint c
  WHERE c.conrelid = 'public.grain_movements'::regclass
    AND c.conname = 'grain_movements_farm_harvest_fkey';

  IF v_deltype IS NOT NULL THEN
    IF v_deltype <> 'r' THEN
      RAISE EXCEPTION
        'Constraint grain_movements_farm_harvest_fkey exists but is not ON DELETE RESTRICT (confdeltype=%)',
        v_deltype
        USING ERRCODE = '42809';
    END IF;
    RETURN;
  END IF;

  FOR v_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.grain_movements'::regclass
      AND c.confrelid = 'public.harvest_records'::regclass
      AND c.conkey = ARRAY[
        (
          SELECT a.attnum
          FROM pg_attribute a
          WHERE a.attrelid = 'public.grain_movements'::regclass
            AND a.attname = 'harvest_record_id'
            AND NOT a.attisdropped
        )
      ]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.grain_movements DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;

  ALTER TABLE public.grain_movements
    ADD CONSTRAINT grain_movements_farm_harvest_fkey
    FOREIGN KEY (farm_id, harvest_record_id)
    REFERENCES public.harvest_records (farm_id, id)
    ON DELETE RESTRICT
    NOT VALID;

  ALTER TABLE public.grain_movements
    VALIDATE CONSTRAINT grain_movements_farm_harvest_fkey;
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
