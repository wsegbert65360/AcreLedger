import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compressDirectory,
  extractArchive,
  sha256File,
} from "../../infrastructure/owner-backup/src/encryption.js";
import {
  buildManifest,
  verifyChecksums,
  writeChecksums,
} from "../../infrastructure/owner-backup/src/manifest.js";
import type { CommandRunner } from "../../infrastructure/owner-backup/src/types.js";
import { applyTenantRecovery, buildApplyPlan, type ApplyExecutor } from "./apply-tenant-recovery.js";
import { tenantBundleChecksum, type TenantBundle } from "./extract-tenant.js";
import { ISOLATED_RESTORE_ORDER, restoreIsolated } from "./restore-isolated.js";

const TARGET_FARM = "11111111-1111-4111-8111-111111111111";
const CONTROL_FARM = "22222222-2222-4222-8222-222222222222";

interface FixtureRow {
  id: string;
  farm_id: string;
  name: string;
  deleted_at: null;
}

function countByTable(dataset: { farms: FixtureRow[]; fields: FixtureRow[] }): Record<string, number> {
  return {
    "public.farms": dataset.farms.length,
    "public.fields": dataset.fields.length,
  };
}

function targetBundle(dataset: { fields: FixtureRow[] }): TenantBundle {
  const fields = dataset.fields.filter((row) => row.farm_id === TARGET_FARM);
  const bundle: TenantBundle = {
    bundleVersion: 1,
    sourceBackupId: "local-disposable-drill",
    sourceRecoveredAt: "2026-09-19T00:00:00.000Z",
    farmId: TARGET_FARM,
    profileIds: [],
    tables: { "public.fields": fields },
    counts: { "public.fields": fields.length },
    storage: { included: [], manualReview: [] },
    checksums: {},
  };
  bundle.checksums["bundle.json"] = tenantBundleChecksum(bundle);
  return bundle;
}

async function run(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acreledger-local-drill-"));
  const plaintext = path.join(root, "plaintext");
  const databaseDir = path.join(plaintext, "database");
  const archive = path.join(root, "synthetic-backup.tar.zst");
  const restored = path.join(root, "restored");

  const dataset = {
    farms: [
      { id: TARGET_FARM, farm_id: TARGET_FARM, name: "Target Farm", deleted_at: null },
      { id: CONTROL_FARM, farm_id: CONTROL_FARM, name: "Control Farm", deleted_at: null },
    ],
    fields: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", farm_id: TARGET_FARM, name: "Target North", deleted_at: null },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", farm_id: CONTROL_FARM, name: "Control South", deleted_at: null },
    ],
  } satisfies { farms: FixtureRow[]; fields: FixtureRow[] };

  try {
    await fs.mkdir(databaseDir, { recursive: true });
    for (const name of ISOLATED_RESTORE_ORDER) {
      await fs.writeFile(path.join(databaseDir, name), `-- disposable drill fixture: ${name}\n`, "utf8");
    }
    await fs.writeFile(path.join(databaseDir, "fixture.json"), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

    const artifacts = await writeChecksums(plaintext);
    const tableCounts = countByTable(dataset);
    const manifest = buildManifest({
      manifestId: "local-disposable-drill",
      projectRefHash: "synthetic-no-project",
      startedAt: new Date("2026-09-19T00:00:00.000Z"),
      completedAt: new Date("2026-09-19T00:00:01.000Z"),
      postgresVersion: "not-executed",
      supabaseCliVersion: "not-executed",
      pgDumpVersion: "not-executed",
      backupWorkerVersion: "local-drill",
      schemas: ["public"],
      tableCounts: Object.entries(tableCounts).map(([qualified, rowCount]) => {
        const [schema, table] = qualified.split(".");
        return { schema, table, rowCount, softDeletedCount: 0 };
      }),
      storage: { bucketCount: 0, objectCount: 0, totalBytes: 0 },
      artifacts,
      retentionTier: "daily",
      recipientFingerprint: "not-exercised",
      dumpNotes: ["Synthetic local fixture; no database connection or external service."],
    });
    await fs.writeFile(path.join(plaintext, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await compressDirectory({ sourceDir: plaintext, destFile: archive });
    const archiveSha256 = await sha256File(archive);
    await extractArchive({ archiveFile: archive, destDir: restored });
    await verifyChecksums(restored);

    const restoredManifest = JSON.parse(await fs.readFile(path.join(restored, "manifest.json"), "utf8")) as typeof manifest;
    const restoredDataset = JSON.parse(await fs.readFile(path.join(restored, "database", "fixture.json"), "utf8")) as typeof dataset;
    const restoredCounts = countByTable(restoredDataset);
    if (JSON.stringify(restoredCounts) !== JSON.stringify(restoredManifest.tableCounts)) {
      throw new Error("Restored synthetic table counts do not match manifest counts.");
    }

    let restorePlanCalls = 0;
    const restorePlanRunner: CommandRunner = {
      async run(command, args) {
        if (command !== "psql" || !args.includes("--single-transaction")) {
          throw new Error("Recovery command did not use the guarded psql restore plan.");
        }
        restorePlanCalls += 1;
        return { stdout: "", stderr: "", code: 0 };
      },
    };
    await restoreIsolated({
      databaseUrl: "postgresql://postgres:disposable@localhost:5432/postgres?sslmode=require",
      plaintextDir: restored,
      runner: restorePlanRunner,
    });

    const bundle = targetBundle(restoredDataset);
    const dryRunSql: string[] = [];
    const dryRunExecutor: ApplyExecutor = {
      async query(sql) {
        dryRunSql.push(sql);
        return { rowCount: 0, rows: [] };
      },
    };
    const dryRun = await applyTenantRecovery({
      bundle,
      mode: "merge",
      dryRun: true,
      farmId: TARGET_FARM,
      confirm: "MERGE-MISSING-DATA",
      preBackupVerified: false,
      executor: dryRunExecutor,
    });
    if (dryRun.written !== 0 || dryRunSql.some((sql) => !sql.startsWith("SELECT"))) {
      throw new Error("Tenant recovery dry run attempted a write.");
    }

    const tainted = structuredClone(bundle);
    tainted.tables["public.fields"].push(restoredDataset.fields.find((row) => row.farm_id === CONTROL_FARM)!);
    tainted.checksums["bundle.json"] = tenantBundleChecksum(tainted);
    let foreignFarmRejected = false;
    try {
      buildApplyPlan({
        bundle: tainted,
        mode: "merge",
        dryRun: true,
        farmId: TARGET_FARM,
        confirm: "MERGE-MISSING-DATA",
        preBackupVerified: false,
        executor: dryRunExecutor,
      });
    } catch (error) {
      foreignFarmRejected = String(error).includes("second farm_id");
    }
    if (!foreignFarmRejected) throw new Error("Tenant recovery did not reject a foreign-farm row.");

    console.log(JSON.stringify({
      status: "ok",
      mode: "local-disposable-synthetic",
      externalMutation: false,
      backup: {
        archiveSha256,
        artifactCount: artifacts.length,
        tableCounts,
      },
      restore: {
        archiveExtracted: true,
        checksumsVerified: true,
        tableCountsMatched: true,
        guardedRestorePlanCalls: restorePlanCalls,
        databaseRestoreExecuted: false,
      },
      tenantIsolation: {
        targetFarm: TARGET_FARM,
        controlFarm: CONTROL_FARM,
        targetRows: bundle.counts["public.fields"],
        dryRunWritten: dryRun.written,
        plannedStatements: dryRun.plan.statements.length,
        foreignFarmRejected,
      },
      unverified: [
        "age encryption/decryption (age binary unavailable)",
        "pg_dump/psql against a disposable PostgreSQL or Supabase instance (clients/runtime unavailable)",
        "Auth users, Storage object restore, RLS sign-in checks, and live count comparisons",
      ],
    }, null, 2));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ status: "failed", detail: String(error) }));
  process.exitCode = 1;
});
