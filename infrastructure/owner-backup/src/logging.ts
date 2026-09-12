import { APPLICATION_ID, type ErrorCode } from "./types.js";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;
const URL_CRED_RE = /([a-z][a-z0-9+.-]*:\/\/[^:/?#\s]+:)([^@/\s]+)@/gi;
const REFRESH_RE = /(refresh_token["']?\s*[:=]\s*["']?)[^"'\s]+/gi;
const ACCESS_RE = /(access_token["']?\s*[:=]\s*["']?)[^"'\s]+/gi;
const PASSWORD_RE = /(password["']?\s*[:=]\s*["']?)[^"'\s]+/gi;

export function sanitizeForLog(value: string): string {
  return value
    .replace(URL_CRED_RE, "$1[redacted]@")
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(REFRESH_RE, "$1[redacted]")
    .replace(ACCESS_RE, "$1[redacted]")
    .replace(PASSWORD_RE, "$1[redacted]")
    .replace(EMAIL_RE, "[redacted-email]");
}

export function logEvent(
  severity: "INFO" | "WARNING" | "ERROR",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const payload: Record<string, unknown> = {
    severity,
    application: APPLICATION_ID,
    event,
    timestamp: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    payload[key] = typeof value === "string" ? sanitizeForLog(value) : value;
  }
  const line = JSON.stringify(payload);
  if (severity === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logFinalEvent(fields: {
  status: string;
  manifestId?: string;
  durationMs: number;
  encryptedBytes?: number;
  tableCount?: number;
  storageObjectCount?: number;
  errorCode?: ErrorCode;
}): void {
  logEvent(fields.status === "success" ? "INFO" : "ERROR", "BACKUP_FINAL", {
    ...fields,
    success: fields.status === "success",
  });
}
