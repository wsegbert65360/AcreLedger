import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { assertTlsDatabaseUrl } from "../../infrastructure/owner-backup/src/config.js";
import { assertFarmScopedWrite, tenantBundleTables, type TenantTable } from "./tenant-registry.js";
import { assertTenantBundleChecksum, type TenantBundle } from "./extract-tenant.js";

export type ApplyMode = "merge" | "snapshot";

export interface ApplyPlan {
  mode: ApplyMode;
  farmId: string;
  dryRun: boolean;
  statements: Array<{ sql: string; params: unknown[]; table: string }>;
  conflicts: Array<{ table: string; id: string }>;
  skippedAuth: true;
}

export interface ApplyExecutor {
  query(sql: string, params: unknown[]): Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }>;
}

export interface ApplyOptions {
  bundle: TenantBundle;
  mode: ApplyMode;
  dryRun: boolean;
  farmId: string;
  confirm: string;
  preBackupVerified: boolean;
  restoreTombstones?: boolean;
  executor: ApplyExecutor;
}

const SNAPSHOT_CONFIRM = "RESTORE-FARM-TO-SNAPSHOT";
const MERGE_CONFIRM = "MERGE-MISSING-DATA";
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`Unsafe database identifier: ${value}`);
  return `"${value}"`;
}

function sqlText(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`Unsafe database identifier: ${value}`);
  return `'${value}'`;
}

function rowColumns(rows: unknown[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Tenant bundle contains a non-object database row.");
    }
    for (const column of Object.keys(row)) {
      quoteIdentifier(column);
      columns.add(column);
    }
  }
  return [...columns].sort();
}

function conflictColumns(entry: TenantTable): string[] {
  return entry.conflictKeys ?? entry.primaryKeys;
}

function keyMatch(alias: string, jsonAlias: string, columns: string[]): string {
  return columns
    .map((column) => `to_jsonb(${alias})->>${sqlText(column)} IS NOT DISTINCT FROM ${jsonAlias}->>${sqlText(column)}`)
    .join(" AND ");
}

function rowIdentity(row: Record<string, unknown>, entry: TenantTable): string {
  return entry.primaryKeys.map((key) => `${key}=${String(row[key])}`).join(",");
}

async function populateConflicts(plan: ApplyPlan, bundle: TenantBundle, executor: ApplyExecutor): Promise<void> {
  for (const entry of tenantBundleTables()) {
    const table = `${entry.schema}.${entry.table}`;
    const rows = bundle.tables[table] ?? [];
    if (rows.length === 0) continue;
    const qualified = `${quoteIdentifier(entry.schema)}.${quoteIdentifier(entry.table)}`;
    const keySets = [entry.primaryKeys, conflictColumns(entry)]
      .filter((keys, index, all) => all.findIndex((candidate) => candidate.join("\0") === keys.join("\0")) === index);
    const join = keySets.map((keys) => `(${keyMatch("existing", "row_data", keys)})`).join(" OR ");
    const existingFarm = entry.farmColumn
      ? `to_jsonb(existing)->>${sqlText(entry.farmColumn)}`
      : entry.ownership === "indirect" && entry.via
        ? `(SELECT to_jsonb(parent)->>${sqlText(entry.via.parentFarmColumn ?? "farm_id")} FROM ${quoteIdentifier(entry.via.schema)}.${quoteIdentifier(entry.via.table)} parent WHERE to_jsonb(parent)->>${sqlText(entry.via.parentColumn)} = to_jsonb(existing)->>${sqlText(entry.via.localColumn)} LIMIT 1)`
        : "NULL";
    const preview = await executor.query(
      `SELECT row_data AS source_row, to_jsonb(existing) AS existing_row, ${existingFarm} AS existing_farm_id FROM jsonb_array_elements($1::jsonb) row_data JOIN ${qualified} existing ON ${join}`,
      [JSON.stringify(rows)],
    );
    for (const result of preview.rows) {
      const source = result.source_row as Record<string, unknown>;
      const foreignFarm = result.existing_farm_id;
      if (foreignFarm != null && String(foreignFarm) !== plan.farmId) {
        throw new Error(`Refusing ${table}: a recovery key is already owned by another farm.`);
      }
      plan.conflicts.push({ table, id: rowIdentity(source, entry) });
    }
  }
}

export function buildApplyPlan(options: ApplyOptions): ApplyPlan {
  assertTenantBundleChecksum(options.bundle);
  if (options.farmId !== options.bundle.farmId) {
    throw new Error("Target farm_id does not match the bundle.");
  }
  if (options.mode === "snapshot" && options.confirm !== SNAPSHOT_CONFIRM) {
    throw new Error("Snapshot restore requires typed confirmation RESTORE-FARM-TO-SNAPSHOT.");
  }
  if (options.mode === "merge" && options.confirm !== MERGE_CONFIRM) {
    throw new Error("Merge restore requires typed confirmation MERGE-MISSING-DATA.");
  }
  if (!options.dryRun && !options.preBackupVerified) {
    throw new Error("Production apply requires a verified pre-recovery backup.");
  }

  const statements: ApplyPlan["statements"] = [];
  const conflicts: ApplyPlan["conflicts"] = [];

  for (const entry of tenantBundleTables()) {
    const key = `${entry.schema}.${entry.table}`;
    const rows = options.bundle.tables[key] ?? [];
    const extraFarm = rows.filter((row) => {
      const record = row as Record<string, unknown>;
      if (entry.ownership === "root") {
        return String(record.id) !== options.farmId;
      }
      if (entry.farmColumn) {
        const farmValue = record[entry.farmColumn];
        return farmValue == null || String(farmValue) !== options.farmId;
      }
      return false;
    });
    if (extraFarm.length > 0) {
      throw new Error(`Bundle for ${key} contains a second farm_id.`);
    }
    const qualified = `"${entry.schema}"."${entry.table}"`;
    const farmFilter =
      entry.ownership === "root"
        ? `(row_data->>'id')::uuid = $2`
        : entry.farmColumn
          ? `(row_data->>'${entry.farmColumn}')::uuid = $2`
          : entry.userColumn
            ? `(row_data->>'${entry.userColumn}')::uuid = ANY($3::uuid[])`
            : `(row_data->>'${entry.via?.localColumn}')::uuid IN (SELECT id FROM public.fields WHERE farm_id = $2)`;
    const keys = conflictColumns(entry);
    const conflictTarget = keys.map(quoteIdentifier).join(", ");
    if (options.mode === "snapshot" && entry.hasDeletedAt && entry.farmColumn) {
      const tombstone = `UPDATE ${qualified} SET deleted_at = coalesce(deleted_at, now()) WHERE "${entry.farmColumn}" = $1 AND deleted_at IS NULL AND id NOT IN (SELECT (row_data->>'id')::uuid FROM jsonb_array_elements($2::jsonb) AS row_data)`;
      assertFarmScopedWrite(tombstone);
      statements.push({ sql: tombstone, params: [options.farmId, JSON.stringify(rows)], table: key });
    }
    const groups = new Map<string, { columns: string[]; rows: unknown[] }>();
    for (const row of rows) {
      const columns = rowColumns([row]);
      const signature = columns.join("\0");
      const group = groups.get(signature) ?? { columns, rows: [] };
      group.rows.push(row);
      groups.set(signature, group);
    }
    for (const group of groups.values()) {
      const quotedColumns = group.columns.map(quoteIdentifier);
      const selectColumns = group.columns.map((column) => `populated.${quoteIdentifier(column)}`);
      const insert = `INSERT INTO ${qualified} (${quotedColumns.join(", ")}) SELECT ${selectColumns.join(", ")} FROM jsonb_array_elements($1::jsonb) AS row_data CROSS JOIN LATERAL jsonb_populate_record(NULL::${qualified}, row_data) AS populated WHERE ${farmFilter}`;
      const params = entry.userColumn && !entry.farmColumn
        ? [JSON.stringify(group.rows), options.farmId, options.bundle.profileIds]
        : [JSON.stringify(group.rows), options.farmId];
      if (options.mode === "merge") {
        const sql = `${insert} ON CONFLICT (${conflictTarget}) DO NOTHING`;
        assertFarmScopedWrite(sql);
        statements.push({ sql, params, table: key });
        continue;
      }
      const immutable = new Set([...keys, ...entry.primaryKeys]);
      const updates = group.columns
        .filter((column) => !immutable.has(column))
        .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);
      const upsert = `${insert} ON CONFLICT (${conflictTarget}) ${updates.length > 0 ? `DO UPDATE SET ${updates.join(", ")}` : "DO NOTHING"}`;
      assertFarmScopedWrite(upsert);
      statements.push({ sql: upsert, params, table: key });
    }
  }

  return {
    mode: options.mode,
    farmId: options.farmId,
    dryRun: options.dryRun,
    statements,
    conflicts,
    skippedAuth: true,
  };
}

export async function applyTenantRecovery(options: ApplyOptions): Promise<{ written: number; plan: ApplyPlan }> {
  const plan = buildApplyPlan(options);
  await populateConflicts(plan, options.bundle, options.executor);
  if (options.dryRun) {
    return { written: 0, plan };
  }
  await options.executor.query("BEGIN", []);
  try {
    await options.executor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [options.farmId]);
    let written = 0;
    for (const statement of plan.statements) {
      assertFarmScopedWrite(statement.sql);
      const result = await options.executor.query(statement.sql, statement.params);
      written += result.rowCount;
    }
    await options.executor.query("COMMIT", []);
    return { written, plan };
  } catch (error) {
    await options.executor.query("ROLLBACK", []);
    throw error;
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = !process.argv.includes("--execute");
  const bundlePath = arg("--bundle") ?? "";
  const databaseUrl = process.env.RECOVERY_DATABASE_URL ?? "";
  assertTlsDatabaseUrl(databaseUrl);
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true },
  });
  const executor: ApplyExecutor = {
    async query(sql, params) {
      const result = await client.query(sql, params);
      return { rowCount: result.rowCount ?? 0, rows: result.rows as Array<Record<string, unknown>> };
    },
  };
  (async () => {
    await client.connect();
    try {
      const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8")) as TenantBundle;
      const result = await applyTenantRecovery({
        bundle,
        mode: arg("--mode") === "snapshot" ? "snapshot" : "merge",
        dryRun,
        farmId: arg("--farm-id") ?? "",
        confirm: arg("--confirm") ?? "",
        preBackupVerified: process.argv.includes("--pre-backup-verified"),
        executor,
      });
      console.log(JSON.stringify({
        written: result.written,
        dryRun: result.plan.dryRun,
        statementCount: result.plan.statements.length,
        conflicts: result.plan.conflicts,
        skippedAuth: result.plan.skippedAuth,
      }));
    } finally {
      await client.end();
    }
  })().catch((error) => {
    console.error(JSON.stringify({ status: "failed", detail: String(error) }));
    process.exitCode = 1;
  });
}
