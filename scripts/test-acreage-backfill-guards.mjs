import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable local PostgreSQL only; never opens a Supabase connection.
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = await readdir(dir);
const versions = ['20260713120000', '20260715120000', '20260715130000'];
const historical = await Promise.all(versions.map(v => readFile(new URL(files.find(f => f.startsWith(v)), dir), 'utf8')));
const retirement = await readFile(new URL(files.find(f => f.endsWith('_retire_historical_acreage_backfills.sql')), dir), 'utf8');
const db = new PGlite();
try {
  await db.exec(`
    CREATE TABLE public.fields (id text PRIMARY KEY, acreage numeric, deleted_at timestamptz);
    CREATE TABLE public.field_clu_assignments (field_id text, acres numeric, land_use text, deleted_at timestamptz);
    CREATE TABLE public.spray_records (field_id text, treated_area_size numeric, deleted_at timestamptz);
    CREATE TABLE public.plant_records (field_id text, acreage numeric, deleted_at timestamptz);
    CREATE TABLE public.fertilizer_applications (field_id text, acres numeric, deleted_at timestamptz);
    INSERT INTO public.fields VALUES ('f', 40, NULL);
    INSERT INTO public.spray_records VALUES ('f', 5, NULL);
    INSERT INTO public.plant_records VALUES ('f', 6, NULL);
    INSERT INTO public.fertilizer_applications VALUES ('f', 7, NULL);
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
    INSERT INTO supabase_migrations.schema_migrations VALUES ('20260713120000'), ('20260715120000'), ('20260715130000');
  `);
  const values = async () => (await db.query(`SELECT
    (SELECT treated_area_size FROM spray_records) AS spray,
    (SELECT acreage FROM plant_records) AS plant,
    (SELECT acres FROM fertilizer_applications) AS fertilizer`)).rows[0];
  const original = await values();
  for (const sql of historical) await db.exec(sql);
  assert.deepEqual(await values(), original, 'Migration ledger must guard the one-shots before retirement');
  await db.exec(retirement);
  await db.exec('DROP SCHEMA supabase_migrations CASCADE');
  for (const sql of historical) { await db.exec(sql); await db.exec(sql); }
  assert.deepEqual(await values(), original, 'Retirement guard must preserve partial areas even without a migration ledger');
  await db.exec(retirement);
  assert.deepEqual(await values(), original, 'Retirement migration itself must be idempotent and data-free');
  console.log('Historical acreage backfill guards passed: ledger, retired replay, partial areas, idempotency.');
} finally {
  await db.close();
}
