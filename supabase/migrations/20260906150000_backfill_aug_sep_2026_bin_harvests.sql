-- One-time repair (agreed 2026-09-05): bin-page "Add grain" entries recorded
-- between Aug 1 and Sep 30, 2026 (America/Chicago) were corn harvested from the
-- field named in source_field_name, but the old form saved only a grain
-- movement — no harvest_records row — so Fall FSA production reporting missed
-- them. This migration creates the missing corn harvest records and links each
-- movement to it. Fail-closed: any candidate whose source_field_name does not
-- resolve to exactly one active field aborts the whole migration instead of
-- guessing field/crop attribution. Assumption applies to this window only; the
-- app now asks for crop explicitly (AddGrainModal harvest path).

BEGIN;

DO $$
DECLARE
    v_window_start timestamptz := '2026-08-01 05:00:00+00'; -- Aug 1 2026 00:00 America/Chicago (CDT)
    v_window_end   timestamptz := '2026-10-01 05:00:00+00'; -- Oct 1 2026 00:00 America/Chicago (CDT)
    v_unresolved   integer;
    v_inserted     integer;
    v_linked       integer;
BEGIN
    -- Every candidate must resolve to exactly one active field in the same farm.
    SELECT count(*) INTO v_unresolved
    FROM public.grain_movements gm
    WHERE gm.type = 'in'
      AND gm.deleted_at IS NULL
      AND gm.harvest_record_id IS NULL
      AND gm.timestamp >= v_window_start
      AND gm.timestamp <  v_window_end
      AND 1 <> (
            SELECT count(*)
            FROM public.fields f
            WHERE f.farm_id = gm.farm_id
              AND f.deleted_at IS NULL
              AND lower(btrim(f.name)) = lower(btrim(gm.source_field_name))
          );
    IF v_unresolved > 0 THEN
        RAISE EXCEPTION
            'backfill_aug_sep_2026_bin_harvests: % candidate grain movements do not match exactly one active field; refusing to guess attribution',
            v_unresolved;
    END IF;

    -- Snapshot the exact movement/field pairs first, then insert and link from
    -- that snapshot so the harvest row and its movement link cannot diverge.
    CREATE TEMP TABLE backfill_aug_sep_2026_harvest_map
    ON COMMIT DROP
    AS
    SELECT gm.id           AS movement_id,
           gen_random_uuid() AS harvest_id,
           gm.farm_id        AS farm_id,
           f.id              AS field_id,
           f.name            AS field_name,
           gm.bin_id         AS bin_id,
           gm.bushels        AS bushels,
           COALESCE(gm.moisture_percent, 15.0) AS moisture_percent,
           CASE
               WHEN f.producer_share IS NULL THEN 0
               ELSE 100 - f.producer_share
           END               AS landlord_split_percent,
           f.landlord_name   AS landlord_name,
           gm.season_year    AS season_year,
           gm.timestamp      AS occurred_at,
           (gm.timestamp AT TIME ZONE 'America/Chicago')::date AS harvest_date
    FROM public.grain_movements gm
    JOIN public.fields f
      ON f.farm_id = gm.farm_id
     AND f.deleted_at IS NULL
     AND lower(btrim(f.name)) = lower(btrim(gm.source_field_name))
    WHERE gm.type = 'in'
      AND gm.deleted_at IS NULL
      AND gm.harvest_record_id IS NULL
      AND gm.timestamp >= v_window_start
      AND gm.timestamp <  v_window_end;

    INSERT INTO public.harvest_records
        (id, farm_id, field_id, field_name, destination, bin_id, bushels,
         moisture_percent, landlord_split_percent, landlord_name, harvest_date,
         season_year, timestamp, crop, deleted_at)
    SELECT
        m.harvest_id,
        m.farm_id,
        m.field_id,
        m.field_name,
        'bin',
        m.bin_id,
        m.bushels,
        m.moisture_percent,
        m.landlord_split_percent,
        m.landlord_name,
        m.harvest_date,
        m.season_year,
        m.occurred_at,
        'Corn',
        NULL
    FROM backfill_aug_sep_2026_harvest_map m;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    UPDATE public.grain_movements gm
    SET harvest_record_id = m.harvest_id
    FROM backfill_aug_sep_2026_harvest_map m
    WHERE gm.id = m.movement_id;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    IF v_inserted <> v_linked THEN
        RAISE EXCEPTION
            'backfill_aug_sep_2026_bin_harvests: inserted % harvest records but linked % grain movements',
            v_inserted, v_linked;
    END IF;
END $$;

COMMIT;
