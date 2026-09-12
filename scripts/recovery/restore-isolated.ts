import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCommandRunner } from "../../infrastructure/owner-backup/src/command.js";
import { assertTlsDatabaseUrl } from "../../infrastructure/owner-backup/src/config.js";
import type { CommandRunner } from "../../infrastructure/owner-backup/src/types.js";

export const ISOLATED_RESTORE_ORDER = [
  "roles.sql",
  "schema.sql",
  "auth-schema.sql",
  "storage-schema.sql",
  "migrations-schema.sql",
  "data.sql",
  "auth-data.sql",
  "storage-metadata.sql",
  "migrations-data.sql",
] as const;

export const REQUIRED_RESTORE_FILES = new Set([
  "roles.sql", "schema.sql", "data.sql", "auth-data.sql", "storage-metadata.sql",
]);

export const RECOVERY_SIDE_EFFECT_DISABLE_SQL = `DO $disable$
DECLARE
  job record;
  webhook record;
  published_table record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR job IN SELECT jobid FROM cron.job WHERE active LOOP
      PERFORM cron.unschedule(job.jobid);
    END LOOP;
  END IF;

  FOR webhook IN
    SELECT event_object_schema, event_object_table, trigger_name
    FROM information_schema.triggers
    WHERE action_statement ILIKE '%net.http%' OR action_statement ILIKE '%http_request%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DISABLE TRIGGER %I',
      webhook.event_object_schema,
      webhook.event_object_table,
      webhook.trigger_name
    );
  END LOOP;

  FOR published_table IN
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname <> 'realtime'
  LOOP
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I',
      published_table.schemaname,
      published_table.tablename
    );
  END LOOP;
END
$disable$;

DO $verify$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job WHERE active) THEN
    RAISE EXCEPTION 'Recovery guard: active cron jobs remain after neutralization';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgenabled <> 'D'
      AND (pg_get_triggerdef(oid) ILIKE '%net.http%' OR pg_get_triggerdef(oid) ILIKE '%http_request%')
  ) THEN
    RAISE EXCEPTION 'Recovery guard: outbound database webhook triggers remain enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname <> 'realtime') THEN
    RAISE EXCEPTION 'Recovery guard: application Realtime publications remain enabled';
  END IF;
END
$verify$`;

export async function restoreIsolated(options: {
  databaseUrl: string;
  plaintextDir: string;
  runner?: CommandRunner;
}): Promise<void> {
  assertTlsDatabaseUrl(options.databaseUrl);
  const runner = options.runner ?? defaultCommandRunner;
  const databaseDir = path.join(options.plaintextDir, "database");
  const present: Array<{ name: string; file: string }> = [];
  for (const name of ISOLATED_RESTORE_ORDER) {
    const file = path.join(databaseDir, name);
    const exists = await fs.access(file).then(() => true, () => false);
    if (!exists && REQUIRED_RESTORE_FILES.has(name)) throw new Error(`Required restore file is missing: ${name}`);
    if (exists) present.push({ name, file: file.replace(/\\/g, "/") });
  }
  const beforeData = present.filter(({ name }) => !["data.sql", "auth-data.sql", "storage-metadata.sql", "migrations-data.sql"].includes(name));
  const data = present.filter(({ name }) => ["data.sql", "auth-data.sql", "storage-metadata.sql", "migrations-data.sql"].includes(name));
  const args = [
    "--single-transaction",
    "--variable",
    "ON_ERROR_STOP=1",
    ...beforeData.flatMap(({ file }) => ["--file", file]),
    "--command",
    RECOVERY_SIDE_EFFECT_DISABLE_SQL,
    "--command",
    "SET session_replication_role = replica",
    ...data.flatMap(({ file }) => ["--file", file]),
    "--dbname",
    options.databaseUrl,
  ];
  const result = await runner.run("psql", args);
  if (result.code !== 0) {
    throw new Error("Isolated restore failed.");
  }
}

export const ISOLATED_PROJECT_GUARDS = [
  "Do not connect the recovery project to production domains or clients.",
  "Do not load production third-party secrets.",
  "The restore command removes recreated Cron schedules and application Realtime publications and disables outbound database webhook triggers before loading data.",
  "Do not configure billing webhooks, outbound email, third-party secrets, or external consumers in the recovery project.",
  "Compare restored counts with manifest.json and stop on mismatch.",
];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  restoreIsolated({
    databaseUrl: process.env.RECOVERY_DATABASE_URL ?? "",
    plaintextDir: arg("--plaintext-dir") ?? "",
  })
    .then(() => {
      console.log(JSON.stringify({ status: "ok", guards: ISOLATED_PROJECT_GUARDS }));
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: "failed", detail: String(error) }));
      process.exitCode = 1;
    });
}
