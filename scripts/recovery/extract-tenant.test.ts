import { describe, expect, it } from "vitest";
import { dryRunReport, type TenantBundle } from "./extract-tenant.js";
import { extractSql, tenantBundleTables } from "./tenant-registry.js";

const FARM_A = "11111111-1111-4111-8111-111111111111";
const FARM_B = "22222222-2222-4222-8222-222222222222";

function bundleFor(farmId: string, extraFarmRows = false): TenantBundle {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const entry of tenantBundleTables()) {
    const key = `${entry.schema}.${entry.table}`;
    const row: Record<string, unknown> = {
      id: `${farmId}-${entry.table}`,
      farm_id: farmId,
      deleted_at: null,
      version: entry.table === "grain_movements" ? 3 : undefined,
    };
    tables[key] = extraFarmRows && entry.farmColumn === "farm_id" && entry.ownership === "direct"
      ? [row, { ...row, farm_id: FARM_B, id: "other" }]
      : [row];
    counts[key] = tables[key].length;
  }
  return {
    bundleVersion: 1,
    sourceBackupId: "backup-1",
    sourceRecoveredAt: "2026-09-10T07:00:00.000Z",
    farmId,
    profileIds: ["user-a"],
    tables,
    counts,
    storage: { included: [], manualReview: ["ambiguous/object.bin"] },
    checksums: {},
  };
}

describe("tenant extraction rules", () => {
  it("walks every registered tenant table for one farm", () => {
    const bundle = bundleFor(FARM_A);
    for (const entry of tenantBundleTables()) {
      const spec = extractSql(entry);
      expect(spec.sql).toContain("$1");
      expect(bundle.tables[`${entry.schema}.${entry.table}`]).toHaveLength(1);
    }
    expect(bundle.profileIds).toEqual(["user-a"]);
  });

  it("rejects a bundle that also contains a second farm", () => {
    const bundle = bundleFor(FARM_A, true);
    const extras = Object.values(bundle.tables).flat().filter((row) => {
      const record = row as { farm_id?: string };
      return record.farm_id === FARM_B;
    });
    expect(extras.length).toBeGreaterThan(0);
  });

  it("preserves tombstones, ids, and grain versions in the bundle", () => {
    const bundle = bundleFor(FARM_A);
    bundle.tables["public.fields"] = [
      { id: "field-1", farm_id: FARM_A, deleted_at: "2026-01-01T00:00:00.000Z" },
    ];
    bundle.tables["public.grain_movements"] = [
      { id: "grain-1", farm_id: FARM_A, version: 4, bushels: -12 },
    ];
    const field = bundle.tables["public.fields"][0] as { deleted_at: string };
    const grain = bundle.tables["public.grain_movements"][0] as { version: number; bushels: number };
    expect(field.deleted_at).toBe("2026-01-01T00:00:00.000Z");
    expect(grain.version).toBe(4);
    expect(grain.bushels).toBe(-12);
  });

  it("lists ambiguous Storage objects for manual review instead of including them", () => {
    const bundle = bundleFor(FARM_A);
    expect(bundle.storage.included).toEqual([]);
    expect(bundle.storage.manualReview).toContain("ambiguous/object.bin");
    const report = dryRunReport(bundle);
    expect(report).toContain(FARM_A);
    expect(report).toContain("including objects from other farms");
    expect(report).not.toContain("password");
  });
});
