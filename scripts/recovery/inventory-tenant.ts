import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { extractSql, tenantBundleTables } from "./tenant-registry.js";

export interface TenantInventory {
  farmId: string;
  profileIds: string[];
  tables: Array<{ schema: string; table: string; count: number }>;
}

export async function inventoryTenant(options: {
  databaseUrl: string;
  farmId: string;
}): Promise<TenantInventory> {
  if (!options.farmId) throw new Error("farm_id is required.");
  const client = new Client({ connectionString: options.databaseUrl, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    const farm = await client.query("SELECT id FROM public.farms WHERE id = $1", [options.farmId]);
    if (farm.rowCount !== 1) throw new Error("Farm not found in the isolated restore.");
    const profiles = await client.query<{ id: string }>(
      "SELECT id FROM public.profiles WHERE farm_id = $1",
      [options.farmId],
    );
    const userIds = profiles.rows.map((row) => row.id);
    const tables: TenantInventory["tables"] = [];
    for (const entry of tenantBundleTables()) {
      const spec = extractSql(entry);
      const result =
        spec.params === "farm"
          ? await client.query(spec.sql, [options.farmId])
          : spec.params === "users"
            ? await client.query(spec.sql, [userIds])
            : await client.query(spec.sql, [options.farmId, userIds]);
      tables.push({ schema: entry.schema, table: entry.table, count: result.rowCount ?? 0 });
    }
    return { farmId: options.farmId, profileIds: userIds, tables };
  } finally {
    await client.end();
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const farmId = arg("--farm-id") ?? "";
  const databaseUrl = process.env.RECOVERY_DATABASE_URL ?? "";
  inventoryTenant({ databaseUrl, farmId })
    .then((result) => {
      console.log(JSON.stringify({
        farmId: result.farmId,
        profileCount: result.profileIds.length,
        tables: result.tables,
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: "failed", detail: String(error) }));
      process.exitCode = 1;
    });
}
