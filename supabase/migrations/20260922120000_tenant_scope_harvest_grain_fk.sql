BEGIN;

-- A single-column harvest_record_id FK proves that a harvest exists, but not
-- that the harvest belongs to the same farm as the grain movement. Fail closed
-- before changing constraints so a dirty production database cannot silently
-- legitimize a cross-farm link.
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

-- PostgreSQL requires the referenced column list itself to be unique even
-- though harvest_records.id is already the primary key.
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

-- Remove only the legacy single-column relationship. The query is structural
-- so it remains safe if PostgreSQL or a prior environment chose another name.
DO $$
DECLARE
  v_constraint record;
BEGIN
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
END $$;

ALTER TABLE public.grain_movements
  ADD CONSTRAINT grain_movements_farm_harvest_fkey
  FOREIGN KEY (farm_id, harvest_record_id)
  REFERENCES public.harvest_records (farm_id, id)
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.grain_movements
  VALIDATE CONSTRAINT grain_movements_farm_harvest_fkey;

COMMENT ON CONSTRAINT grain_movements_farm_harvest_fkey
  ON public.grain_movements IS
  'A linked grain movement and its harvest must belong to the same farm. Harvest lifecycle uses soft deletion; hard deletion is restricted.';

COMMIT;
