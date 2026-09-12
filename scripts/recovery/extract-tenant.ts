import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { assertTlsDatabaseUrl } from "../../infrastructure/owner-backup/src/config.js";
import { extractSql, tenantBundleTables, type TenantTable } from "./tenant-registry.js";

export interface TenantBundle {
  bundleVersion: 1;
  sourceBackupId: string;
  sourceRecoveredAt: string;
  farmId: string;
  profileIds: string[];
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
  storage: { included: string[]; manualReview: string[] };
  checksums: Record<string, string>;
}

function rowFarmIds(entry: TenantTable, rows: Array<Record<string, unknown>>, farmId: string): void {
  if (entry.farmColumn) {
    const foreign = rows.filter((row) => {
      const value = row[entry.farmColumn as string];
      return value == null || String(value) !== farmId;
    });
    if (foreign.length > 0) {
      throw new Error(`Extracted ${entry.schema}.${entry.table} contained a second farm_id.`);
    }
  }
}

export function tenantBundleChecksum(bundle: TenantBundle): string {
  const unsigned = { ...bundle, checksums: {} };
  return createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
}

export function assertTenantBundleChecksum(bundle: TenantBundle): void {
  const expected = bundle.checksums?.["bundle.json"];
  if (!expected || expected !== tenantBundleChecksum(bundle)) {
    throw new Error("Tenant bundle checksum does not match.");
  }
}

export async function extractTenant(options: {
  databaseUrl: string;
  farmId: string;
  sourceBackupId: string;
  outputDir: string;
  confirmFarmId: string;
}): Promise<TenantBundle> {
  if (options.farmId !== options.confirmFarmId) {
    throw new Error("Typed farm_id confirmation does not match.");
  }
  assertTlsDatabaseUrl(options.databaseUrl);
  const client = new Client({ connectionString: options.databaseUrl, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    const farm = await client.query("SELECT id FROM public.farms WHERE id = $1", [options.farmId]);
    if (farm.rowCount !== 1) throw new Error("Farm not found.");
    const profiles = await client.query<{ id: string }>(
      "SELECT id FROM public.profiles WHERE farm_id = $1",
      [options.farmId],
    );
    const userIds = profiles.rows.map((row) => row.id);
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const entry of tenantBundleTables()) {
      const spec = extractSql(entry);
      const result =
        spec.params === "farm"
          ? await client.query(spec.sql, [options.farmId])
          : spec.params === "users"
            ? await client.query(spec.sql, [userIds])
            : await client.query(spec.sql, [options.farmId, userIds]);
      const rows = result.rows as Array<Record<string, unknown>>;
      rowFarmIds(entry, rows, options.farmId);
      const key = `${entry.schema}.${entry.table}`;
      tables[key] = rows;
      counts[key] = rows.length;
    }
    const storageRows = await client.query<{ bucket_id: string; name: string }>(
      "SELECT bucket_id, name FROM storage.objects ORDER BY bucket_id, name",
    );
    const storageKeys = storageRows.rows.map((row) => `${row.bucket_id}/${row.name}`);
    const bundle: TenantBundle = {
      bundleVersion: 1,
      sourceBackupId: options.sourceBackupId,
      sourceRecoveredAt: new Date().toISOString(),
      farmId: options.farmId,
      profileIds: userIds,
      tables,
      counts,
      storage: { included: [], manualReview: storageKeys },
      checksums: {},
    };
    bundle.checksums["bundle.json"] = tenantBundleChecksum(bundle);
    await fs.mkdir(options.outputDir, { recursive: true });
    await fs.writeFile(path.join(options.outputDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
    return bundle;
  } finally {
    await client.end();
  }
}

export function dryRunReport(bundle: TenantBundle): string {
  const lines = [
    `Farm ${bundle.farmId}`,
    `Profiles: ${bundle.profileIds.length}`,
    "Table counts:",
    ...Object.entries(bundle.counts).map(([table, count]) => `  ${table}: ${count}`),
    "Storage manual review lists every object key in the restored project, including objects from other farms; no object is attributed to this farm automatically.",
  ];
  return lines.join("\n");
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  extractTenant({
    databaseUrl: process.env.RECOVERY_DATABASE_URL ?? "",
    farmId: arg("--farm-id") ?? "",
    confirmFarmId: arg("--confirm-farm-id") ?? "",
    sourceBackupId: arg("--source-backup-id") ?? "",
    outputDir: arg("--output-dir") ?? "",
  })
    .then((bundle) => {
      console.log(dryRunReport(bundle));
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: "failed", detail: String(error) }));
      process.exitCode = 1;
    });
}
