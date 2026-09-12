import { chicagoDate } from "./retention.js";
import type { DriveClient } from "./drive.js";
import { APPLICATION_ID, LEDGER_FILE_NAME, STALE_LOCK_MS, STATUS_FILE_NAME, type BackupRunStatus } from "./types.js";

export interface RunLedger {
  application: typeof APPLICATION_ID;
  runDateChicago: string;
  manifestId: string;
  status: BackupRunStatus;
  startedAt: string;
  updatedAt: string;
  cloudRunExecution?: string;
}

export type LockResult =
  | { action: "acquired"; ledger: RunLedger }
  | { action: "duplicate-success"; ledger: RunLedger }
  | { action: "in-progress"; ledger: RunLedger };

export async function acquireRunLock(options: {
  drive: DriveClient;
  now: Date;
  manifestId: string;
  cloudRunExecution?: string;
}): Promise<LockResult> {
  const runDateChicago = chicagoDate(options.now);
  const files = await options.drive.listBackupFiles();
  const existingLedger = files.find((file) => file.name === LEDGER_FILE_NAME);
  const status = files.find((file) => file.name === STATUS_FILE_NAME);
  const ledgerProps = existingLedger?.appProperties;
  const statusProps = status?.appProperties;
  const statusSha256 = statusProps?.archive_sha256;
  const successfulManifest = (
    ledgerProps?.run_date_chicago === runDateChicago && ledgerProps.status === "success" &&
    statusProps?.run_date_chicago === runDateChicago && statusProps.status === "success" &&
    ledgerProps.manifest_id && ledgerProps.manifest_id === statusProps.manifest_id &&
    statusSha256
  ) ? ledgerProps.manifest_id : undefined;
  const existingArchive = successfulManifest
    ? files.find((file) =>
        file.name.endsWith(".tar.zst.age") &&
        file.appProperties?.verification_status === "success" &&
        file.appProperties?.run_date_chicago === runDateChicago &&
        file.appProperties?.manifest_id === successfulManifest &&
        file.appProperties?.archive_sha256 === statusSha256)
    : undefined;

  if (existingArchive && successfulManifest) {
    return {
      action: "duplicate-success",
      ledger: {
        application: APPLICATION_ID,
        runDateChicago,
        manifestId: successfulManifest,
        status: "success",
        startedAt: existingArchive.appProperties?.backup_time_utc ?? options.now.toISOString(),
        updatedAt: options.now.toISOString(),
      },
    };
  }

  let current: RunLedger | undefined;
  if (existingLedger) {
    // Ledger contents are non-PII status only; we treat appProperties as source of truth.
    const props = existingLedger.appProperties ?? {};
    if (props.run_date_chicago === runDateChicago) {
      current = {
        application: APPLICATION_ID,
        runDateChicago,
        manifestId: props.manifest_id ?? options.manifestId,
        status: (props.status as BackupRunStatus) ?? "running",
        startedAt: props.started_at ?? options.now.toISOString(),
        updatedAt: props.updated_at ?? options.now.toISOString(),
      };
    }
  }

  if (current?.status === "running") {
    const started = Date.parse(current.startedAt);
    if (Number.isFinite(started) && options.now.getTime() - started < STALE_LOCK_MS) {
      return { action: "in-progress", ledger: current };
    }
  }

  const ledger: RunLedger = {
    application: APPLICATION_ID,
    runDateChicago,
    manifestId: options.manifestId,
    status: "running",
    startedAt: options.now.toISOString(),
    updatedAt: options.now.toISOString(),
    cloudRunExecution: options.cloudRunExecution,
  };

  await options.drive.uploadJson({
    name: LEDGER_FILE_NAME,
    body: ledger,
    existingId: existingLedger?.id,
    appProperties: {
      kind: "run-ledger",
      run_date_chicago: ledger.runDateChicago,
      manifest_id: ledger.manifestId,
      status: ledger.status,
      started_at: ledger.startedAt,
      updated_at: ledger.updatedAt,
    },
  });

  return { action: "acquired", ledger };
}

export async function updateRunLock(
  drive: DriveClient,
  ledger: RunLedger,
  status: BackupRunStatus,
  now: Date,
): Promise<void> {
  const next: RunLedger = { ...ledger, status, updatedAt: now.toISOString() };
  const files = await drive.listBackupFiles();
  const existing = files.find((file) => file.name === LEDGER_FILE_NAME);
  await drive.uploadJson({
    name: LEDGER_FILE_NAME,
    body: next,
    existingId: existing?.id,
    appProperties: {
      kind: "run-ledger",
      run_date_chicago: next.runDateChicago,
      manifest_id: next.manifestId,
      status: next.status,
      started_at: next.startedAt,
      updated_at: next.updatedAt,
    },
  });
}
