import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendAlert } from "./alerts.js";
import { ageRecipientFingerprint, loadConfig, type BackupConfig } from "./config.js";
import { exportDatabase } from "./databaseExport.js";
import { archiveAppProperties, createDriveClient, DriveAuthError, type DriveClient } from "./drive.js";
import { acquireDatabaseExecutionLock } from "./executionLock.js";
import {
  archiveFileName,
  compressDirectory,
  encryptFile,
  md5File,
  sha256File,
} from "./encryption.js";
import { acquireRunLock, updateRunLock } from "./lock.js";
import { logEvent, logFinalEvent } from "./logging.js";
import { buildManifest, writeChecksums } from "./manifest.js";
import { chooseRetentionTier, filesToDelete } from "./retention.js";
import { exportStorageObjects } from "./storageExport.js";
import { APPLICATION_ID, STATUS_FILE_NAME, type CommandRunner, type ErrorCode, type StatusManifest } from "./types.js";
import { wipePaths } from "./wipe.js";

export interface BackupDependencies {
  config: BackupConfig;
  drive: DriveClient;
  exportDatabase: typeof exportDatabase;
  exportStorage: typeof exportStorageObjects;
  compressDirectory: typeof compressDirectory;
  encryptFile: typeof encryptFile;
  now: () => Date;
  runner?: CommandRunner;
  acquireExecutionLock?: () => Promise<() => Promise<void>>;
}

export interface BackupRunResult {
  status: "success" | "failed" | "skipped-duplicate";
  manifestId?: string;
  errorCode?: ErrorCode;
  durationMs: number;
  encryptedBytes?: number;
  tableCount?: number;
  storageObjectCount?: number;
}

function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof DriveAuthError) return "AUTH_REVOKED";
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "TLS_REQUIRED") return "TLS_REQUIRED";
    if (code === "CONFIG_INVALID") return "CONFIG_INVALID";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Failed to count")) return "TABLE_EXPORT_FAILED";
  if (message.includes("Storage")) return "STORAGE_EXPORT_FAILED";
  if (message.includes("age")) return "ENCRYPT_FAILED";
  if (message.includes("checksum") || message.includes("Checksum")) return "CHECKSUM_MISMATCH";
  if (message.includes("Drive")) return "UPLOAD_FAILED";
  if (message.includes("lock") || message.includes("in-progress")) return "LOCK_HELD";
  return "UNKNOWN";
}

export async function runBackup(deps: BackupDependencies): Promise<BackupRunResult> {
  const started = deps.now();
  const manifestId = randomUUID();
  const runDir = path.join(deps.config.workDir, manifestId);
  const plaintextDir = path.join(runDir, "plaintext");
  const workFiles: string[] = [runDir];
  let retentionWarning = false;
  let acquiredLedger: Awaited<ReturnType<typeof acquireRunLock>>["ledger"] | undefined;
  let unverifiedArchiveId: string | undefined;
  let releaseExecutionLock: (() => Promise<void>) | undefined;

  const finish = async (result: Omit<BackupRunResult, "durationMs">): Promise<BackupRunResult> => {
    try {
      await wipePaths(workFiles);
    } catch {
      logEvent("WARNING", "PLAINTEXT_WIPE_FAILED", { errorCode: "WIPE_FAILED" });
    }
    if (releaseExecutionLock) {
      await releaseExecutionLock().catch(() => {
        logEvent("WARNING", "EXECUTION_LOCK_RELEASE_FAILED", { errorCode: "UNKNOWN" });
      });
      releaseExecutionLock = undefined;
    }
    const durationMs = deps.now().getTime() - started.getTime();
    logFinalEvent({ ...result, durationMs });
    if (result.status === "failed") {
      await sendAlert(deps.config.alertWebhookUrl, {
        code: result.errorCode ?? "UNKNOWN",
        title: "AcreLedger owner backup failed",
        detail: `Backup run failed with code ${result.errorCode ?? "UNKNOWN"}.`,
      }).catch((alertError) => {
        logEvent("ERROR", "ALERT_FAILED", { errorCode: "ALERT_FAILED", detail: String(alertError) });
      });
    }
    return { ...result, durationMs };
  };

  try {
    await fs.mkdir(deps.config.workDir, { recursive: true });
    if (deps.acquireExecutionLock) releaseExecutionLock = await deps.acquireExecutionLock();
    const lock = await acquireRunLock({
      drive: deps.drive,
      now: started,
      manifestId,
      cloudRunExecution: process.env.CLOUD_RUN_EXECUTION,
    });

    if (lock.action === "duplicate-success") {
      logEvent("INFO", "BACKUP_SKIPPED_DUPLICATE", { runDateChicago: lock.ledger.runDateChicago });
      return finish({ status: "skipped-duplicate", manifestId: lock.ledger.manifestId });
    }
    if (lock.action === "in-progress") {
      throw new Error("Another backup run is in-progress for this date.");
    }
    acquiredLedger = lock.ledger;

    const databaseDir = path.join(plaintextDir, "database");
    const storageDir = path.join(plaintextDir, "storage");
    await fs.mkdir(databaseDir, { recursive: true });
    await fs.mkdir(storageDir, { recursive: true });

    const database = await deps.exportDatabase({
      config: deps.config,
      databaseDir,
      runner: deps.runner,
    });
    const storage = await deps.exportStorage({
      config: deps.config,
      storageDir,
    });

    const existing = await deps.drive.listBackupFiles();
    const retentionTier = chooseRetentionTier(started, existing, deps.config.driveFolderId);
    const artifacts = await writeChecksums(plaintextDir);
    const completedAt = deps.now();
    const manifest = buildManifest({
      manifestId,
      projectRefHash: deps.config.projectRefHash,
      startedAt: started,
      completedAt,
      postgresVersion: database.postgresVersion,
      supabaseCliVersion: database.supabaseCliVersion,
      pgDumpVersion: database.pgDumpVersion,
      backupWorkerVersion: deps.config.workerVersion,
      schemas: database.schemas,
      tableCounts: database.tableCounts,
      storage: {
        bucketCount: storage.bucketCount,
        objectCount: storage.objectCount,
        totalBytes: storage.totalBytes,
      },
      artifacts,
      retentionTier,
      recipientFingerprint: ageRecipientFingerprint(deps.config.ageRecipient),
      dumpNotes: database.dumpNotes,
    });
    await fs.writeFile(path.join(plaintextDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const tarPath = path.join(runDir, archiveFileName(started, manifestId).replace(/\.age$/, ""));
    const encryptedPath = `${tarPath}.age`;
    workFiles.push(tarPath, encryptedPath);

    await deps.compressDirectory({ sourceDir: plaintextDir, destFile: tarPath, runner: deps.runner });
    await deps.encryptFile({
      sourceFile: tarPath,
      destFile: encryptedPath,
      recipient: deps.config.ageRecipient,
      runner: deps.runner,
    });
    await wipePaths([plaintextDir, tarPath]);

    const encryptedSha256 = await sha256File(encryptedPath);
    const encryptedMd5 = await md5File(encryptedPath);
    const encryptedStat = await fs.stat(encryptedPath);
    const archiveProperties = archiveAppProperties({
      manifestId,
      backupTimeUtc: started.toISOString(),
      retentionTier,
      encryptedSha256,
      runDateChicago: lock.ledger.runDateChicago,
    });
    const uploaded = await deps.drive.uploadResumable({
      filePath: encryptedPath,
      name: path.basename(encryptedPath),
      mimeType: "application/octet-stream",
      appProperties: archiveProperties,
    });
    unverifiedArchiveId = uploaded.id;
    const verified = await deps.drive.getFile(uploaded.id);
    if (Number(verified.size ?? "0") !== encryptedStat.size) {
      throw new Error("Drive upload byte length did not match the local encrypted archive.");
    }
    if (!verified.md5Checksum || verified.md5Checksum !== encryptedMd5) {
      throw new Error("Drive upload checksum did not match the local encrypted archive.");
    }
    const status: StatusManifest = {
      application: APPLICATION_ID,
      status: "success",
      manifestId,
      backupTimeUtc: started.toISOString(),
      runDateChicago: lock.ledger.runDateChicago,
      retentionTier,
      encryptedBytes: encryptedStat.size,
      encryptedSha256,
      tableCount: database.tableCounts.length,
      storageObjectCount: storage.objectCount,
      durationMs: deps.now().getTime() - started.getTime(),
    };
    const statusFiles = existing.filter((file) => file.name === STATUS_FILE_NAME);
    await deps.drive.uploadJson({
      name: STATUS_FILE_NAME,
      body: status,
      existingId: statusFiles[0]?.id,
      appProperties: {
        kind: "status",
        manifest_id: manifestId,
        backup_time_utc: started.toISOString(),
        status: "success",
        run_date_chicago: lock.ledger.runDateChicago,
        archive_sha256: encryptedSha256,
      },
    });

    await updateRunLock(deps.drive, lock.ledger, "success", deps.now());
    await deps.drive.updateAppProperties(uploaded.id, {
      ...archiveProperties,
      verification_status: "success",
    });
    unverifiedArchiveId = undefined;

    const afterUpload = await deps.drive.listBackupFiles();
    const plan = filesToDelete({ files: afterUpload, folderId: deps.config.driveFolderId });
    for (const file of plan.delete) {
      try {
        await deps.drive.deleteFile(file.id);
      } catch {
        retentionWarning = true;
      }
    }
    if (retentionWarning || plan.warnings.length > 0) {
      await sendAlert(deps.config.alertWebhookUrl, {
        code: "RETENTION_FAILURE",
        title: "AcreLedger backup retention needs follow-up",
        detail: "A verified backup exists, but one or more old archives could not be deleted.",
      }).catch(() => undefined);
    }

    return finish({
      status: "success",
      manifestId,
      encryptedBytes: encryptedStat.size,
      tableCount: database.tableCounts.length,
      storageObjectCount: storage.objectCount,
      errorCode: retentionWarning ? "RETENTION_WARNING" : undefined,
    });
  } catch (error) {
    if (unverifiedArchiveId) {
      await deps.drive.deleteFile(unverifiedArchiveId).catch(() => undefined);
    }
    const code = errorCodeOf(error);
    logEvent("ERROR", "BACKUP_FAILED", { errorCode: code });
    if (acquiredLedger) {
      await updateRunLock(deps.drive, acquiredLedger, "failed", deps.now()).catch(() => undefined);
    }
    return finish({ status: "failed", manifestId, errorCode: code });
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const drive = createDriveClient(config);
  const result = await runBackup({
    config,
    drive,
    exportDatabase,
    exportStorage: exportStorageObjects,
    compressDirectory,
    encryptFile,
    now: () => new Date(),
    acquireExecutionLock: () => acquireDatabaseExecutionLock(config),
  });
  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((error) => {
    logEvent("ERROR", "BACKUP_CRASH", { errorCode: "UNKNOWN", detail: String(error) });
    process.exitCode = 1;
  });
}
