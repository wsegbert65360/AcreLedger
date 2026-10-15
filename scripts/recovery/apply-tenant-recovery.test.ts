import { describe, expect, it } from "vitest";
import { applyTenantRecovery, buildApplyPlan, type ApplyExecutor } from "./apply-tenant-recovery.js";
import { TENANT_REGISTRY_VERSION, tenantBundleTables } from "./tenant-registry.js";
import { tenantBundleChecksum, type TenantBundle } from "./extract-tenant.js";

const FARM = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function bundle(farmId = FARM): TenantBundle {
  const tables: Record<string, unknown[]> = {};
  for (const entry of tenantBundleTables()) {
    tables[`${entry.schema}.${entry.table}`] = [
      {
        id: entry.ownership === "root" ? farmId : `${entry.table}-1`,
        farm_id: farmId,
        deleted_at: null,
        ...(entry.schema === "public" && entry.table === "farms" ? { name: "Home Place" } : {}),
      },
    ];
  }
  const result: TenantBundle = {
    bundleVersion: 1,
    registryVersion: TENANT_REGISTRY_VERSION,
    extractedTables: tenantBundleTables().map((entry) => `${entry.schema}.${entry.table}`),
    sourceBackupId: "backup-1",
    sourceRecoveredAt: "2026-09-10T07:00:00.000Z",
    farmId,
    profileIds: ["user-a"],
    tables,
    counts: {},
    storage: { included: [], manualReview: [] },
    checksums: {},
  };
  result.checksums["bundle.json"] = tenantBundleChecksum(result);
  return result;
}

function recordingExecutor(): ApplyExecutor & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    async query(text) {
      sql.push(text);
      return { rowCount: 1, rows: [] };
    },
  };
}

describe("apply tenant recovery", () => {
  it("dry run performs zero writes", async () => {
    const executor = recordingExecutor();
    const result = await applyTenantRecovery({
      bundle: bundle(),
      mode: "merge",
      dryRun: true,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor,
    });
    expect(result.written).toBe(0);
    expect(executor.sql.every((sql) => sql.startsWith("SELECT"))).toBe(true);
    expect(result.plan.skippedAuth).toBe(true);
  });

  it("rejects snapshot mode until the farm name and RESTORE are both typed", () => {
    const base = {
      bundle: bundle(),
      mode: "snapshot" as const,
      dryRun: false,
      farmId: FARM,
      preBackupVerified: true,
      executor: recordingExecutor(),
    };
    expect(() => buildApplyPlan({ ...base, confirm: "RESTORE" })).toThrow(/farm name as the first/);
    expect(() => buildApplyPlan({ ...base, confirmFarmName: "Other Place", confirm: "RESTORE" })).toThrow(/does not match/);
    expect(() => buildApplyPlan({ ...base, confirmFarmName: "Home Place", confirm: "yes" })).toThrow(/typed confirmation RESTORE/);
    expect(() => buildApplyPlan({
      ...base,
      confirmFarmName: "  Home Place  ",
      confirm: "RESTORE",
      preBackupVerified: false,
    })).toThrow(/pre-recovery backup/);
  });

  it("refuses snapshot restore when the bundle has no farm name", () => {
    const value = bundle();
    value.tables["public.farms"] = [{ id: FARM, farm_id: FARM, deleted_at: null }];
    value.checksums["bundle.json"] = tenantBundleChecksum(value);
    expect(() => buildApplyPlan({
      bundle: value,
      mode: "snapshot",
      dryRun: true,
      farmId: FARM,
      confirmFarmName: "Home Place",
      confirm: "RESTORE",
      preBackupVerified: false,
      executor: recordingExecutor(),
    })).toThrow(/cannot find the farm name/);
  });

  it("rejects a second farm_id in the bundle", () => {
    const tainted = bundle();
    tainted.tables["public.fields"] = [{ id: "x", farm_id: OTHER }];
    tainted.checksums["bundle.json"] = tenantBundleChecksum(tainted);
    expect(() =>
      buildApplyPlan({
        bundle: tainted,
        mode: "merge",
        dryRun: true,
        farmId: FARM,
        confirm: "MERGE-MISSING-DATA",
        preBackupVerified: true,
        executor: recordingExecutor(),
      }),
    ).toThrow(/second farm_id/);
  });

  it("uses each table's registered conflict key instead of assuming id", () => {
    const plan = buildApplyPlan({
      bundle: bundle(),
      mode: "merge",
      dryRun: true,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor: recordingExecutor(),
    });
    const rateLimit = plan.statements.find((statement) => statement.table === "ai_assistant_private.rate_limits");
    expect(rateLimit?.sql).toContain('ON CONFLICT ("user_id") DO NOTHING');
    const rainfall = plan.statements.find((statement) => statement.table === "public.farm_rainfall_daily");
    expect(rainfall?.sql).toContain('ON CONFLICT ("farm_id", "date_local") DO NOTHING');
  });

  it("groups legacy rows by present keys so absent columns are not overwritten with null", () => {
    const value = bundle();
    value.tables["public.fields"] = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", farm_id: FARM, deleted_at: null },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", farm_id: FARM, deleted_at: null, newer_column: "kept" },
    ];
    value.checksums["bundle.json"] = tenantBundleChecksum(value);
    const plan = buildApplyPlan({
      bundle: value,
      mode: "snapshot",
      dryRun: true,
      farmId: FARM,
      confirmFarmName: "Home Place",
      confirm: "RESTORE",
      preBackupVerified: false,
      executor: recordingExecutor(),
    });
    const inserts = plan.statements.filter((statement) => statement.table === "public.fields" && statement.sql.startsWith("INSERT"));
    expect(inserts).toHaveLength(2);
    expect(inserts.filter((statement) => statement.sql.includes('"newer_column" = EXCLUDED."newer_column"'))).toHaveLength(1);
  });

  it("rejects a farm-owned row with a missing farm_id", () => {
    const value = bundle();
    value.tables["public.fields"] = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }];
    value.checksums["bundle.json"] = tenantBundleChecksum(value);
    expect(() => buildApplyPlan({
      bundle: value,
      mode: "merge",
      dryRun: true,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor: recordingExecutor(),
    })).toThrow(/second farm_id/);
  });

  it("scopes snapshot writes to the target farm and never issues DELETE", async () => {
    const executor = recordingExecutor();
    await applyTenantRecovery({
      bundle: bundle(),
      mode: "snapshot",
      dryRun: false,
      farmId: FARM,
      confirmFarmName: "Home Place",
      confirm: "RESTORE",
      preBackupVerified: true,
      executor,
    });
    expect(executor.sql).toContain("BEGIN");
    const beginIndex = executor.sql.indexOf("BEGIN");
    expect(executor.sql[beginIndex + 1]).toBe("SELECT set_config('acreledger.equipment_rpc', 'on', true)");
    expect(executor.sql.findIndex((item) => item.includes('INSERT INTO "public"."equipment"')))
      .toBeGreaterThan(executor.sql.indexOf("SELECT set_config('acreledger.equipment_rpc', 'on', true)"));
    expect(executor.sql.at(-1)).toBe("COMMIT");
    expect(executor.sql.some((item) => item.toLowerCase().includes("delete "))).toBe(false);
    expect(executor.sql.some((item) => item.includes("farm_id"))).toBe(true);
  });

  it("rolls back the target transaction on failure", async () => {
    const sql: string[] = [];
    const executor: ApplyExecutor = {
      async query(text) {
        sql.push(text);
        if (text.startsWith("INSERT") || text.startsWith("UPDATE")) {
          throw new Error("constraint");
        }
        return { rowCount: 0, rows: [] };
      },
    };
    await expect(
      applyTenantRecovery({
        bundle: bundle(),
        mode: "merge",
        dryRun: false,
        farmId: FARM,
        confirm: "MERGE-MISSING-DATA",
        preBackupVerified: true,
        executor,
      }),
    ).rejects.toThrow(/constraint/);
    expect(sql.at(-1)).toBe("ROLLBACK");
  });

  it("refuses a bundle missing an includeInTenantBundle table key", () => {
    const value = bundle();
    delete value.tables["public.fields"];
    value.checksums["bundle.json"] = tenantBundleChecksum(value);
    expect(() => buildApplyPlan({
      bundle: value,
      mode: "merge",
      dryRun: true,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor: recordingExecutor(),
    })).toThrow(/missing required table public\.fields/);
  });

  it("accepts an empty array for a required table key", () => {
    const value = bundle();
    value.tables["public.fields"] = [];
    value.checksums["bundle.json"] = tenantBundleChecksum(value);
    expect(() => buildApplyPlan({
      bundle: value,
      mode: "merge",
      dryRun: true,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor: recordingExecutor(),
    })).not.toThrow();
  });

  it("refuses a registry version mismatch", () => {
    const value = bundle();
    value.registryVersion = TENANT_REGISTRY_VERSION + 1;
    value.checksums["bundle.json"] = tenantBundleChecksum(value);
    expect(() => buildApplyPlan({
      bundle: value,
      mode: "merge",
      dryRun: true,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor: recordingExecutor(),
    })).toThrow(/registry version mismatch/);
  });

  it("never tombstones the root farms row in snapshot mode", () => {
    const plan = buildApplyPlan({
      bundle: bundle(),
      mode: "snapshot",
      dryRun: true,
      farmId: FARM,
      confirmFarmName: "Home Place",
      confirm: "RESTORE",
      preBackupVerified: false,
      executor: recordingExecutor(),
    });
    expect(plan.statements.some((statement) => (
      statement.table === "public.farms" && statement.sql.startsWith("UPDATE")
    ))).toBe(false);
  });

  it("does not plan billing tables and reports Stripe reconcile in skipped", () => {
    const plan = buildApplyPlan({
      bundle: bundle(),
      mode: "snapshot",
      dryRun: true,
      farmId: FARM,
      confirmFarmName: "Home Place",
      confirm: "RESTORE",
      preBackupVerified: false,
      executor: recordingExecutor(),
    });
    expect(plan.statements.some((statement) => statement.table.includes("billing") || statement.table === "public.farm_subscriptions")).toBe(false);
    expect(plan.skipped.some((item) => item.table === "public.farm_subscriptions" && /billing/i.test(item.reason))).toBe(true);
    expect(plan.skipped.some((item) => item.table === "public.account_deletion_requests")).toBe(true);
  });

  it("scopes snapshot DO UPDATE to EXCLUDED.farm_id", () => {
    const plan = buildApplyPlan({
      bundle: bundle(),
      mode: "snapshot",
      dryRun: true,
      farmId: FARM,
      confirmFarmName: "Home Place",
      confirm: "RESTORE",
      preBackupVerified: false,
      executor: recordingExecutor(),
    });
    const fieldUpsert = plan.statements.find((statement) => statement.table === "public.fields" && statement.sql.includes("DO UPDATE"));
    expect(fieldUpsert?.sql).toContain('WHERE "fields".farm_id = EXCLUDED.farm_id');
  });

  it("runs the conflict scan after the advisory lock inside the write transaction", async () => {
    const executor = recordingExecutor();
    await applyTenantRecovery({
      bundle: bundle(),
      mode: "merge",
      dryRun: false,
      farmId: FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: true,
      executor,
    });
    const begin = executor.sql.indexOf("BEGIN");
    const lock = executor.sql.findIndex((item) => item.includes("pg_advisory_xact_lock"));
    const conflict = executor.sql.findIndex((item) => item.includes("jsonb_array_elements"));
    const insert = executor.sql.findIndex((item) => item.startsWith("INSERT"));
    expect(lock).toBeGreaterThan(begin);
    expect(conflict).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(conflict);
  });
});
