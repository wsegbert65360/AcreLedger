import { describe, expect, it } from "vitest";
import { applyTenantRecovery, buildApplyPlan, type ApplyExecutor } from "./apply-tenant-recovery.js";
import { tenantBundleTables } from "./tenant-registry.js";
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
      },
    ];
  }
  const result: TenantBundle = {
    bundleVersion: 1,
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

  it("rejects snapshot mode without the second confirmation and pre-backup", () => {
    expect(() =>
      buildApplyPlan({
        bundle: bundle(),
        mode: "snapshot",
        dryRun: false,
        farmId: FARM,
        confirm: "yes",
        preBackupVerified: true,
        executor: recordingExecutor(),
      }),
    ).toThrow(/RESTORE-FARM-TO-SNAPSHOT/);
    expect(() =>
      buildApplyPlan({
        bundle: bundle(),
        mode: "snapshot",
        dryRun: false,
        farmId: FARM,
        confirm: "RESTORE-FARM-TO-SNAPSHOT",
        preBackupVerified: false,
        executor: recordingExecutor(),
      }),
    ).toThrow(/pre-recovery backup/);
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
      confirm: "RESTORE-FARM-TO-SNAPSHOT",
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
      confirm: "RESTORE-FARM-TO-SNAPSHOT",
      preBackupVerified: true,
      executor,
    });
    expect(executor.sql).toContain("BEGIN");
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
});
