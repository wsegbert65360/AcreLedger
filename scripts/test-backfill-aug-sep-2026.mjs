// Isolated PostgreSQL regression test; no network or farm data is used.
// Run with the absolute path to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(
  new URL('../supabase/migrations/20260906150000_backfill_aug_sep_2026_bin_harvests.sql', import.meta.url),
  'utf8',
);
const farm = '00000000-0000-0000-0000-000000000001';
const otherFarm = '00000000-0000-0000-0000-000000000002';
const fieldHarryId = '00000000-0000-0000-0000-000000000003';
const fieldTimberId = '00000000-0000-0000-0000-000000000004';
const fieldDeletedId = '00000000-0000-0000-0000-000000000005';
const fieldOtherFarmId = '00000000-0000-0000-0000-000000000006';
const binId = '00000000-0000-0000-0000-000000000007';
const existingHarvestId = '00000000-0000-0000-0000-000000000008';
// Movement IDs in chronological fixtures order:
// m-linked (already has a harvest), m-out (type out), m-deleted (soft deleted),
// m-harry (unlinked, 'Harry middle' lowercase), m-timber (unlinked, 'Timber'),
// m-july (outside window), m-blank (blank source — must abort the run).
const m = {
  linked: '00000000-0000-0000-0000-000000000011',
  out: '00000000-0000-0000-0000-000000000012',
  deleted: '00000000-0000-0000-0000-000000000013',
  harry: '00000000-0000-0000-0000-000000000014',
  timber: '00000000-0000-0000-0000-000000000015',
  july: '00000000-0000-0000-0000-000000000016',
  blank: '00000000-0000-0000-0000-000000000017',
};

await db.exec(`
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.fields (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, name text NOT NULL,
    producer_share numeric, landlord_name text, deleted_at timestamptz
  );
  CREATE TABLE public.harvest_records (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, field_id uuid NOT NULL,
    field_name text NOT NULL, destination text NOT NULL, bin_id uuid,
    bushels numeric NOT NULL, moisture_percent numeric NOT NULL,
    landlord_split_percent numeric NOT NULL, landlord_name text,
    harvest_date date,
    season_year integer NOT NULL, timestamp timestamptz NOT NULL,
    crop text, deleted_at timestamptz
  );
  CREATE TABLE public.grain_movements (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, bin_id uuid NOT NULL,
    bin_name text NOT NULL, type text NOT NULL, bushels numeric NOT NULL,
    moisture_percent numeric, source_field_name text,
    season_year integer NOT NULL, timestamp timestamptz NOT NULL,
    deleted_at timestamptz, harvest_record_id uuid REFERENCES public.harvest_records(id),
    version bigint NOT NULL DEFAULT 1
  );
  CREATE FUNCTION public.bump_grain_movement_version() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      NEW.version := OLD.version + 1;
      RETURN NEW;
    END;
    $$;
  CREATE TRIGGER grain_movements_bump_version
    BEFORE UPDATE ON public.grain_movements
    FOR EACH ROW EXECUTE FUNCTION public.bump_grain_movement_version();
  CREATE UNIQUE INDEX one_active_movement_per_harvest
    ON public.grain_movements(harvest_record_id)
    WHERE harvest_record_id IS NOT NULL AND deleted_at IS NULL;

  INSERT INTO public.profiles VALUES ('${otherFarm}', '${otherFarm}');

  INSERT INTO public.fields
    (id, farm_id, name, producer_share, landlord_name, deleted_at)
  VALUES
    ('${fieldHarryId}', '${farm}', 'Harry Middle', 66.66, 'Landlord A', NULL),
    ('${fieldTimberId}', '${farm}', 'Timber', 66.66, NULL, NULL),
    ('${fieldDeletedId}', '${farm}', 'Gone Field', 100, NULL, '2026-01-01T00:00:00Z'),
    ('${fieldOtherFarmId}', '${otherFarm}', 'Harry Middle', 100, NULL, NULL);

  INSERT INTO public.harvest_records
    (id, farm_id, field_id, field_name, destination, bin_id, bushels,
     moisture_percent, landlord_split_percent, landlord_name, harvest_date,
     season_year, timestamp, crop, deleted_at)
  VALUES
    ('${existingHarvestId}', '${farm}', '${fieldHarryId}', 'Harry Middle', 'bin',
     '${binId}', 100, 15, 0, NULL, NULL, 2026, '2026-09-04T15:00:00Z', 'Corn', NULL);

  INSERT INTO public.grain_movements
    (id, farm_id, bin_id, bin_name, type, bushels, moisture_percent,
     source_field_name, season_year, timestamp, deleted_at, harvest_record_id, version)
  VALUES
    ('${m.linked}',  '${farm}', '${binId}', 'Bin 2', 'in', 410, 15, 'Harry Middle', 2026, '2026-09-04T15:59:00Z', NULL, '${existingHarvestId}', 1),
    ('${m.out}',     '${farm}', '${binId}', 'Bin 2', 'out', 50, 15, NULL, 2026, '2026-09-04T16:00:00Z', NULL, NULL, 1),
    ('${m.deleted}', '${farm}', '${binId}', 'Bin 2', 'in', 410, 15, 'Harry Middle', 2026, '2026-09-04T17:00:00Z', '2026-09-04T18:00:00Z', NULL, 1),
    ('${m.harry}',   '${farm}', '${binId}', 'Bin 2', 'in', 415, 16, 'Harry middle', 2026, '2026-09-04T19:44:00Z', NULL, NULL, 1),
    ('${m.timber}',  '${farm}', '${binId}', 'Bin 2', 'in', 325, 17, 'Timber', 2026, '2026-09-06T04:59:00Z', NULL, NULL, 1),
    ('${m.july}',    '${farm}', '${binId}', 'Bin 2', 'in', 999, 15, 'Harry Middle', 2026, '2026-07-15T12:00:00Z', NULL, NULL, 1),
    ('${m.blank}',   '${farm}', '${binId}', 'Bin 2', 'in', 500, 15, '', 2026, '2026-09-05T23:00:00Z', NULL, NULL, 1);
`);

const count = async (sql) => (await db.query(`SELECT count(*)::int AS value FROM ${sql}`)).rows[0].value;

// Run 1: the blank-source candidate must abort the whole migration, leaving
// zero new harvests and no movement linked.
await assert.rejects(db.exec(migration), /do not match exactly one active field/);
await db.exec('ROLLBACK').catch(() => {});
assert.equal(await count('public.harvest_records'), 1, 'aborted run must roll back harvest inserts');
assert.equal(
  (await db.query(`SELECT harvest_record_id, version FROM public.grain_movements WHERE id = '${m.harry}'`)).rows[0].harvest_record_id,
  null,
  'aborted run must roll back movement links',
);

// Remove the blocker and run the migration for real.
await db.exec(`DELETE FROM public.grain_movements WHERE id = '${m.blank}'`);
await db.exec(migration);

const backfilled = (await db.query(`
  SELECT hr.id, hr.farm_id, hr.field_id, hr.field_name, hr.destination, hr.bin_id,
         hr.bushels::float8 AS bushels, hr.moisture_percent::float8 AS moisture,
         hr.landlord_split_percent::float8 AS split, hr.landlord_name, hr.harvest_date::text AS harvest_date,
         hr.season_year, hr.crop, hr.deleted_at,
         gm.version, gm.source_field_name
  FROM public.harvest_records hr
  JOIN public.grain_movements gm ON gm.harvest_record_id = hr.id
  WHERE hr.id <> '${existingHarvestId}'
  ORDER BY hr.field_name
`)).rows;

assert.equal(backfilled.length, 2, 'exactly two harvests are created');
assert.deepEqual(backfilled.map(row => row.field_name), ['Harry Middle', 'Timber']);
for (const row of backfilled) {
  assert.equal(row.crop, 'Corn');
  assert.equal(row.destination, 'bin');
  assert.equal(row.bin_id, binId);
  assert.equal(row.split, 33.34);
  assert.equal(row.season_year, 2026);
  assert.equal(row.deleted_at, null);
  assert.notEqual(row.id, null);
}
assert.equal(backfilled[0].field_id, fieldHarryId);
assert.equal(backfilled[0].landlord_name, 'Landlord A');
assert.equal(backfilled[0].harvest_date, '2026-09-04');
assert.equal(backfilled[0].source_field_name, 'Harry middle');
assert.equal(backfilled[0].bushels, 415);
assert.equal(backfilled[0].moisture, 16);
assert.equal(backfilled[1].field_id, fieldTimberId);
assert.equal(backfilled[1].landlord_name, null);
assert.equal(backfilled[1].harvest_date, '2026-09-05', 'uses America/Chicago local date before UTC midnight');
assert.equal(backfilled[1].bushels, 325);
assert.notEqual(backfilled[1].field_id, fieldOtherFarmId, 'matches only same-farm fields');

// Excluded rows stay untouched.
assert.equal(
  (await db.query(`SELECT harvest_record_id FROM public.grain_movements WHERE id = '${m.linked}'`)).rows[0].harvest_record_id,
  existingHarvestId,
  'already-linked movement is not re-pointed',
);
assert.equal(await count(`public.grain_movements WHERE id = '${m.out}' AND harvest_record_id IS NULL AND version = 1`), 1);
assert.equal(await count(`public.grain_movements WHERE id = '${m.deleted}' AND harvest_record_id IS NULL AND version = 1`), 1);
assert.equal(await count(`public.grain_movements WHERE id = '${m.july}' AND harvest_record_id IS NULL AND version = 1`), 1);

// The linking UPDATE legitimately bumps the DB-managed version.
assert.equal(
  (await db.query(`SELECT version::int AS value FROM public.grain_movements WHERE id = '${m.harry}'`)).rows[0].value,
  2,
  'linking UPDATE must bump the concurrency version',
);

await db.close();
console.log('Backfill PostgreSQL regression checks passed: fail-closed abort with rollback, corn harvest creation, landlord allocation, America/Chicago harvest dates, case-insensitive same-farm field match, window/link exclusions, and version bump.');
