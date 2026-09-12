export const MANIFEST_VERSION = 2;
export const APPLICATION_ID = "acreledger-owner-backup";
export const DRIVE_FOLDER_NAME = "AcreLedger Database Backups";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const PINNED_SUPABASE_CLI_VERSION = "2.107.0";
export const DAILY_RETENTION = 30;
export const MONTHLY_RETENTION = 12;
export const STALE_LOCK_MS = 6 * 60 * 60 * 1000;
export const STATUS_FILE_NAME = "acreledger-backup-status.json";
export const LEDGER_FILE_NAME = "acreledger-backup-ledger.json";

export type RetentionTier = "daily" | "monthly";
export type BackupRunStatus = "running" | "success" | "failed" | "skipped-duplicate";

export interface TableCount {
  schema: string;
  table: string;
  rowCount: number | null;
  softDeletedCount: number | null;
  error?: string;
}

export interface StorageObjectMeta {
  bucket: string;
  key: string;
  archivePath: string;
  size: number;
  etag?: string;
  contentType?: string;
  lastModified?: string;
  sha256: string;
}

export interface BackupManifest {
  manifestVersion: number;
  manifestId: string;
  projectRefHash: string;
  startedAt: string;
  completedAt: string;
  postgresVersion: string;
  supabaseCliVersion: string;
  pgDumpVersion: string;
  backupWorkerVersion: string;
  schemas: string[];
  tableCounts: Record<string, number | "unreadable">;
  failedTables: Array<{ schema: string; table: string; errorCode: string }>;
  storage: {
    bucketCount: number;
    objectCount: number;
    totalBytes: number;
  };
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  retentionTier: RetentionTier;
  encryption: {
    scheme: "age";
    recipientFingerprint: string;
  };
  dumpNotes: string[];
}

export interface StatusManifest {
  application: typeof APPLICATION_ID;
  status: BackupRunStatus;
  manifestId?: string;
  backupTimeUtc?: string;
  runDateChicago?: string;
  retentionTier?: RetentionTier;
  encryptedBytes?: number;
  encryptedSha256?: string;
  tableCount?: number;
  storageObjectCount?: number;
  durationMs?: number;
  errorCode?: string;
}

export interface DriveFileRecord {
  id: string;
  name: string;
  size?: string;
  md5Checksum?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  createdTime?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv },
  ): Promise<CommandResult>;
}

export type ErrorCode =
  | "CONFIG_INVALID"
  | "TLS_REQUIRED"
  | "LOCK_HELD"
  | "DUMP_FAILED"
  | "TABLE_EXPORT_FAILED"
  | "STORAGE_EXPORT_FAILED"
  | "CHECKSUM_MISMATCH"
  | "ENCRYPT_FAILED"
  | "UPLOAD_FAILED"
  | "UPLOAD_INCOMPLETE"
  | "AUTH_REVOKED"
  | "RETENTION_WARNING"
  | "ALERT_FAILED"
  | "WIPE_FAILED"
  | "UNKNOWN";
