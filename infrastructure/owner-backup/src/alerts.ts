import { logEvent, sanitizeForLog } from "./logging.js";
import type { ErrorCode } from "./types.js";

export interface Alert {
  code: ErrorCode | "NO_RECENT_BACKUP" | "RETENTION_FAILURE" | "RESTORE_VERIFY_FAILED";
  title: string;
  detail: string;
}

export async function sendAlert(
  webhookUrl: string | undefined,
  alert: Alert,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const safeDetail = sanitizeForLog(alert.detail);
  logEvent("ERROR", "BACKUP_ALERT", {
    alertCode: alert.code,
    title: alert.title,
    detail: safeDetail,
  });
  if (!webhookUrl) return;
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      application: "acreledger-owner-backup",
      code: alert.code,
      title: alert.title,
      detail: safeDetail,
      timestamp: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Alert webhook returned HTTP ${response.status}`);
  }
}
