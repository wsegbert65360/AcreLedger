import { createHash } from "node:crypto";
import path from "node:path";
import { PINNED_SUPABASE_CLI_VERSION } from "./types.js";

const REQUIRED_ENV = [
  "OWNER_BACKUP_DATABASE_URL",
  "OWNER_BACKUP_AGE_RECIPIENT",
  "OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_ID",
  "OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_SECRET",
  "OWNER_BACKUP_GOOGLE_REFRESH_TOKEN",
  "OWNER_BACKUP_DRIVE_FOLDER_ID",
] as const;

export interface BackupConfig {
  databaseUrl: string;
  ageRecipient: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  driveFolderId: string;
  s3Endpoint?: string;
  s3Region: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  alertWebhookUrl?: string;
  workerVersion: string;
  projectRefHash: string;
  workDir: string;
  supabaseCliVersion: string;
  sslRejectUnauthorized: boolean;
  chicagoTimeZone: string;
}

export class ConfigError extends Error {
  readonly code: "CONFIG_INVALID" | "TLS_REQUIRED";
  constructor(message: string, code: "CONFIG_INVALID" | "TLS_REQUIRED" = "CONFIG_INVALID") {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

export function hashProjectRef(projectRef: string): string {
  return createHash("sha256").update(projectRef).digest("hex").slice(0, 16);
}

export function assertTlsDatabaseUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ConfigError("Database URL is not a valid URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new ConfigError("Database URL must use postgres:// or postgresql://.");
  }
  if (parsed.port === "6543") {
    throw new ConfigError(
      "Transaction pooler port 6543 cannot be used for dump/restore. Use a direct connection or the session pooler on port 5432.",
    );
  }
  const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (sslmode === "disable" || sslmode === "allow" || sslmode === "prefer") {
    throw new ConfigError(
      "Database URL must use TLS (sslmode=require or sslmode=verify-full).",
      "TLS_REQUIRED",
    );
  }
  if (!sslmode) {
    throw new ConfigError(
      "Database URL must include sslmode=require or sslmode=verify-full.",
      "TLS_REQUIRED",
    );
  }
  if (sslmode !== "require" && sslmode !== "verify-full" && sslmode !== "verify-ca") {
    throw new ConfigError(`Unsupported sslmode '${sslmode}'.`, "TLS_REQUIRED");
  }
  return parsed;
}

function readRequired(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required secret or configuration: ${key}`);
  }
  if (key.startsWith("VITE_")) {
    throw new ConfigError("VITE_* variables must never be used for owner backup.");
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_") && key.toLowerCase().includes("backup")) {
      throw new ConfigError("VITE_* variables must never be used for owner backup.");
    }
  }

  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new ConfigError(`Missing required configuration: ${missing.join(", ")}`);
  }

  const databaseUrl = readRequired(env, "OWNER_BACKUP_DATABASE_URL");
  assertTlsDatabaseUrl(databaseUrl);
  if (env.OWNER_BACKUP_SSL_REJECT_UNAUTHORIZED === "false") {
    throw new ConfigError("TLS certificate verification cannot be disabled for owner backups.", "TLS_REQUIRED");
  }

  const recipient = readRequired(env, "OWNER_BACKUP_AGE_RECIPIENT");
  if (!recipient.startsWith("age1")) {
    throw new ConfigError("OWNER_BACKUP_AGE_RECIPIENT must be an age public recipient (age1...).");
  }

  const projectRef = env.OWNER_BACKUP_PROJECT_REF?.trim() ?? "unknown";
  const workDir = env.OWNER_BACKUP_WORK_DIR?.trim() || path.join("/tmp", "acreledger-owner-backup");

  return {
    databaseUrl,
    ageRecipient: recipient,
    googleClientId: readRequired(env, "OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_ID"),
    googleClientSecret: readRequired(env, "OWNER_BACKUP_GOOGLE_OAUTH_CLIENT_SECRET"),
    googleRefreshToken: readRequired(env, "OWNER_BACKUP_GOOGLE_REFRESH_TOKEN"),
    driveFolderId: readRequired(env, "OWNER_BACKUP_DRIVE_FOLDER_ID"),
    s3Endpoint: env.OWNER_BACKUP_S3_ENDPOINT?.trim() || undefined,
    s3Region: env.OWNER_BACKUP_S3_REGION?.trim() || "auto",
    s3AccessKeyId: env.OWNER_BACKUP_S3_ACCESS_KEY_ID?.trim() || undefined,
    s3SecretAccessKey: env.OWNER_BACKUP_S3_SECRET_ACCESS_KEY?.trim() || undefined,
    alertWebhookUrl: env.OWNER_BACKUP_ALERT_WEBHOOK_URL?.trim() || undefined,
    workerVersion: env.OWNER_BACKUP_WORKER_VERSION?.trim() || "dev",
    projectRefHash: hashProjectRef(projectRef),
    workDir,
    supabaseCliVersion: env.OWNER_BACKUP_SUPABASE_CLI_VERSION?.trim() || PINNED_SUPABASE_CLI_VERSION,
    sslRejectUnauthorized: true,
    chicagoTimeZone: "America/Chicago",
  };
}

export function ageRecipientFingerprint(recipient: string): string {
  return createHash("sha256").update(recipient).digest("hex").slice(0, 16);
}
