import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { TENANT_REGISTRY } from "./tenant-registry.js";

const url = process.env.RECOVERY_TEST_DATABASE_URL;

describe.skipIf(!url)("tenant registry vs information_schema", () => {
  it("fails when a new farm-owned table is missing from the registry", async () => {
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
    await client.connect();
    try {
      const farmIdTables = await client.query<{ table_schema: string; table_name: string }>(
        `SELECT table_schema, table_name
         FROM information_schema.columns
         WHERE column_name = 'farm_id'
           AND table_schema NOT IN ('pg_catalog', 'information_schema')
         GROUP BY 1, 2`,
      );
      const registry = new Set(TENANT_REGISTRY.map((entry) => `${entry.schema}.${entry.table}`));
      const missing = farmIdTables.rows
        .map((row) => `${row.table_schema}.${row.table_name}`)
        .filter((key) => !registry.has(key));
      expect(missing).toEqual([]);

      const fkTables = await client.query<{ table_schema: string; table_name: string }>(
        `SELECT DISTINCT nsp.nspname AS table_schema, cls.relname AS table_name
         FROM pg_constraint con
         JOIN pg_class cls ON cls.oid = con.conrelid
         JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
         JOIN pg_class fcls ON fcls.oid = con.confrelid
         JOIN pg_namespace fnsp ON fnsp.oid = fcls.relnamespace
         WHERE con.contype = 'f'
           AND fnsp.nspname = 'public'
           AND fcls.relname IN ('farms', 'profiles')
           AND nsp.nspname NOT IN ('pg_catalog', 'information_schema')`,
      );
      const missingFk = fkTables.rows
        .map((row) => `${row.table_schema}.${row.table_name}`)
        .filter((key) => !registry.has(key));
      expect(missingFk).toEqual([]);

      const stillThere = TENANT_REGISTRY.filter((entry) => entry.schema !== "auth" && entry.schema !== "storage");
      for (const entry of stillThere) {
        const found = await client.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
          [entry.schema, entry.table],
        );
        if (entry.table === "field_rainfall_daily" || entry.table === "rainfall_settings") {
          continue;
        }
        expect(found.rowCount, `${entry.schema}.${entry.table} no longer exists`).toBe(1);
      }
    } finally {
      await client.end();
    }
  });
});
