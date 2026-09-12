import { Client } from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackupConfig } from "./config.js";
import { assertSuccess, defaultCommandRunner } from "./command.js";
import { logEvent } from "./logging.js";
import { withRetry } from "./retry.js";
import type { CommandRunner, TableCount } from "./types.js";
import { PINNED_SUPABASE_CLI_VERSION } from "./types.js";

export const SYSTEM_SCHEMAS = [
  "information_schema",
  "pg_catalog",
  "pg_toast",
  "pgbouncer",
  "graphql",
  "graphql_public",
  "pgsodium",
  "pgsodium_masks",
  "pgtle",
  "repack",
  "tiger",
  "tiger_data",
  "extensions",
  "vault",
  "etl",
  "realtime",
  "_analytics",
  "_realtime",
  "_supavisor",
  "net",
  "cron",
  "dbdev",
] as const;

export const DEFAULT_APP_DATA_SCHEMAS = [
  "public",
  "ai_assistant_private",
  "weather_proxy_private",
] as const;

export interface DumpSpec {
  file: string;
  args: string[];
  required: boolean;
}

export function buildDumpSpecs(appSchemas: string[]): DumpSpec[] {
  const schemaList = appSchemas.join(",");
  return [
    { file: "roles.sql", args: ["--role-only"], required: true },
    { file: "schema.sql", args: [], required: true },
    {
      file: "data.sql",
      args: ["--use-copy", "--data-only", "--schema", schemaList],
      required: true,
    },
    {
      file: "auth-data.sql",
      args: ["--use-copy", "--data-only", "--schema", "auth"],
      required: true,
    },
    {
      file: "storage-metadata.sql",
      args: [
        "--use-copy",
        "--data-only",
        "--schema",
        "storage",
        "-x",
        "storage.buckets_vectors",
        "-x",
        "storage.vector_indexes",
      ],
      required: true,
    },
    {
      file: "auth-schema.sql",
      args: ["--schema", "auth"],
      required: false,
    },
    {
      file: "storage-schema.sql",
      args: ["--schema", "storage"],
      required: false,
    },
    {
      file: "migrations-schema.sql",
      args: ["--schema", "supabase_migrations"],
      required: false,
    },
    {
      file: "migrations-data.sql",
      args: ["--use-copy", "--data-only", "--schema", "supabase_migrations"],
      required: false,
    },
  ];
}

export interface DatabaseExportResult {
  postgresVersion: string;
  pgDumpVersion: string;
  supabaseCliVersion: string;
  schemas: string[];
  tableCounts: TableCount[];
  dumpNotes: string[];
  artifactPaths: string[];
}

function sslConfig(config: BackupConfig): boolean | { rejectUnauthorized: boolean } {
  return { rejectUnauthorized: config.sslRejectUnauthorized };
}

export async function withDatabase<T>(
  config: BackupConfig,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: sslConfig(config),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function listApplicationSchemas(client: Client): Promise<string[]> {
  const result = await client.query<{ schema_name: string }>(
    `SELECT schema_name
     FROM information_schema.schemata
     WHERE schema_name <> ALL($1)
     ORDER BY schema_name`,
    [SYSTEM_SCHEMAS],
  );
  const found = result.rows.map((row) => row.schema_name);
  const required = DEFAULT_APP_DATA_SCHEMAS.filter((schema) => found.includes(schema));
  const extra = found.filter(
    (schema) =>
      !DEFAULT_APP_DATA_SCHEMAS.includes(schema as (typeof DEFAULT_APP_DATA_SCHEMAS)[number]) &&
      schema !== "auth" &&
      schema !== "storage" &&
      schema !== "supabase_migrations" &&
      schema !== "supabase_functions",
  );
  return [...required, ...extra];
}

export async function collectTableInventory(client: Client): Promise<TableCount[]> {
  const tables = await client.query<{ schema: string; table: string }>(
    `SELECT n.nspname AS schema, c.relname AS table
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname <> ALL($1)
     ORDER BY 1, 2`,
    [SYSTEM_SCHEMAS],
  );

  const counts: TableCount[] = [];
  for (const row of tables.rows) {
    const qualified = `"${row.schema}"."${row.table}"`;
    try {
      const total = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${qualified}`);
      let softDeletedCount: number | null = null;
      const columns = await client.query<{ attname: string }>(
        `SELECT a.attname
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = 'deleted_at' AND a.attnum > 0 AND NOT a.attisdropped`,
        [row.schema, row.table],
      );
      if (columns.rowCount) {
        const deleted = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${qualified} WHERE deleted_at IS NOT NULL`,
        );
        softDeletedCount = Number(deleted.rows[0].count);
      }
      counts.push({
        schema: row.schema,
        table: row.table,
        rowCount: Number(total.rows[0].count),
        softDeletedCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unreadable";
      logEvent("WARNING", "TABLE_INVENTORY_FAILED", {
        schema: row.schema,
        table: row.table,
        errorCode: "TABLE_EXPORT_FAILED",
      });
      counts.push({
        schema: row.schema,
        table: row.table,
        rowCount: null,
        softDeletedCount: null,
        error: message.slice(0, 120),
      });
    }
  }
  return counts;
}

export async function collectConfiguration(client: Client): Promise<Record<string, unknown>> {
  const extensions = await client.query<{ extname: string; extversion: string }>(
    "SELECT extname, extversion FROM pg_extension ORDER BY extname",
  );
  let cronJobs: Array<{ jobname: string; schedule: string }> = [];
  try {
    const cron = await client.query<{ jobname: string; schedule: string }>(
      "SELECT jobname, schedule FROM cron.job ORDER BY jobname",
    );
    cronJobs = cron.rows;
  } catch {
    cronJobs = [];
  }

  return {
    postgresMajorVersion: 17,
    extensions: extensions.rows,
    cronJobs: cronJobs.map((job) => ({
      name: job.jobname,
      schedule: job.schedule,
    })),
    edgeFunctions: ["mrms-hourly", "mrms-backfill"],
    vaultSecretNames: ["mrms_automation_api_key", "mrms_project_url"],
    realtime: {
      publication: "supabase_realtime",
      requiredTables: ["profiles"],
    },
    notes: [
      "Do not copy secret values from the source project. Recreate Auth URLs, API keys, Vault secrets, and third-party credentials by name.",
      "CLI 2.107.0 schema dump excludes auth and storage; those are exported as dedicated artifacts.",
      "CLI 2.107.0 default data dump includes auth and storage rows. This worker splits them into data.sql, auth-data.sql, and storage-metadata.sql so restore is explicit.",
      "Storage object bytes are not in the database dump; they are exported separately.",
    ],
  };
}

async function captureVersion(runner: CommandRunner, command: string, args: string[]): Promise<string> {
  try {
    const result = await runner.run(command, args);
    const text = `${result.stdout} ${result.stderr}`.trim();
    return text.split(/\r?\n/)[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function exportDatabase(options: {
  config: BackupConfig;
  databaseDir: string;
  runner?: CommandRunner;
}): Promise<DatabaseExportResult> {
  const runner = options.runner ?? defaultCommandRunner;
  await fs.mkdir(options.databaseDir, { recursive: true });

  const dumpNotes: string[] = [
    `Pinned Supabase CLI version: ${PINNED_SUPABASE_CLI_VERSION}.`,
    "Verified 2026-09-10: `supabase db dump` schema dump excludes auth and storage.",
    "Verified 2026-09-10: `supabase db dump --data-only --use-copy` includes auth and storage table data unless --schema is narrowed.",
    "Prefer a direct db.<ref>.supabase.co:5432 connection; otherwise the session pooler on port 5432. Never use transaction pooling (6543).",
  ];

  const inventory = await withDatabase(options.config, async (client) => {
    const postgres = await client.query<{ version: string }>("SHOW server_version");
    const schemas = await listApplicationSchemas(client);
    const tableCounts = await collectTableInventory(client);
    const configuration = await collectConfiguration(client);
    return {
      postgresVersion: postgres.rows[0].version,
      schemas,
      tableCounts,
      configuration,
    };
  });

  const unreadable = inventory.tableCounts.filter((row) => row.rowCount === null);
  if (unreadable.length > 0) {
    throw new Error(`Failed to count ${unreadable.length} table(s); refusing incomplete backup.`);
  }

  await fs.writeFile(
    path.join(options.databaseDir, "inventory.json"),
    `${JSON.stringify(inventory.tableCounts, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(options.databaseDir, "configuration.json"),
    `${JSON.stringify(inventory.configuration, null, 2)}\n`,
    "utf8",
  );

  const specs = buildDumpSpecs(inventory.schemas);
  const artifactPaths: string[] = [
    path.join(options.databaseDir, "inventory.json"),
    path.join(options.databaseDir, "configuration.json"),
  ];

  for (const spec of specs) {
    const dest = path.join(options.databaseDir, spec.file);
    const args = [
      "db",
      "dump",
      "--db-url",
      options.config.databaseUrl,
      "-f",
      dest,
      ...spec.args,
    ];
    const result = await withRetry(() => runner.run("supabase", args), { attempts: 3, baseMs: 1000 });
    if (result.code !== 0) {
      if (spec.required) {
        assertSuccess(result, `supabase db dump ${spec.file}`);
      } else {
        dumpNotes.push(`Optional dump ${spec.file} was skipped or failed.`);
        continue;
      }
    }
    artifactPaths.push(dest);
  }

  const pgDumpVersion = await captureVersion(runner, "pg_dump", ["--version"]);
  const supabaseCliVersion = await captureVersion(runner, "supabase", ["--version"]);

  return {
    postgresVersion: inventory.postgresVersion,
    pgDumpVersion,
    supabaseCliVersion: supabaseCliVersion || options.config.supabaseCliVersion,
    schemas: inventory.schemas,
    tableCounts: inventory.tableCounts,
    dumpNotes,
    artifactPaths,
  };
}
