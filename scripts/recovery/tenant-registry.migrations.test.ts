import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_REGISTRY } from "./tenant-registry.js";

// Runs without a database: every table the migrations give a farm_id column
// must be classified in the tenant registry (the integration test checks the
// live schema too, but only when RECOVERY_TEST_DATABASE_URL is set).
const dir = resolve(import.meta.dirname, "../../supabase/migrations");
const sql = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(resolve(dir, file), "utf8").replace(/--.*$/gm, ""))
  .join("\n");

function farmIdTables(): Set<string> {
  const found = new Set<string>();
  const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
  for (const m of sql.matchAll(create)) {
    if (/(^|[\s,(])farm_id\s+uuid/i.test(m[3])) found.add(`${m[1] ?? "public"}.${m[2]}`);
  }
  const addColumn = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(\w+)\.)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?farm_id\b/gi;
  for (const m of sql.matchAll(addColumn)) found.add(`${m[1] ?? "public"}.${m[2]}`);
  return found;
}

describe("tenant registry vs migrations", () => {
  it("classifies every table that has a farm_id column", () => {
    const registry = new Set(TENANT_REGISTRY.map((entry) => `${entry.schema}.${entry.table}`));
    const tables = farmIdTables();
    expect(tables.size).toBeGreaterThan(20);
    expect([...tables].filter((key) => !registry.has(key)).sort()).toEqual([]);
  });

  it("does not call a farm_id table global", () => {
    const tables = farmIdTables();
    const wrong = TENANT_REGISTRY
      .filter((entry) => entry.ownership === "global" && tables.has(`${entry.schema}.${entry.table}`))
      .map((entry) => `${entry.schema}.${entry.table}`);
    expect(wrong).toEqual([]);
  });
});
