import { toast } from 'sonner';

import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { isPaidReport, isPremiumRequiredError } from '@/lib/entitlements';

type RpcCall = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ error: { code?: string | null; message?: string | null } | null } | null | undefined>;

export interface ReportExportClient {
  rpc: unknown;
}

export type ReportExportDenialReason = 'premium_required' | 'unavailable';

export type ReportExportAuthorization =
  | { allowed: true }
  | { allowed: false; reason: ReportExportDenialReason };

const ALLOWED: ReportExportAuthorization = { allowed: true };

/**
 * Asks the server before a Pro report is saved, shared, printed, or exported.
 * `assert_premium` (feature `reports`) is a no-op that returns success when
 * ENTITLEMENTS_MODE is off, logs and returns success in shadow, and raises
 * P0402 for a free farm in enforce.
 *
 * Allowed only when that call returns with no error. Any error, a thrown
 * exception, or being offline denies the action. Free reports and a missing
 * farm skip the call. The report is still built on the device.
 */
export async function authorizeReportExport(
  client: ReportExportClient,
  farmId: string | null | undefined,
  reportType: string,
): Promise<ReportExportAuthorization> {
  if (!isPaidReport(reportType) || !farmId) return ALLOWED;
  try {
    const result = await (client.rpc as RpcCall)('assert_premium', {
      p_farm_id: farmId,
      p_feature: 'reports',
    });
    if (result && result.error == null) return ALLOWED;
    if (result && isPremiumRequiredError(result.error)) {
      return { allowed: false, reason: 'premium_required' };
    }
    return { allowed: false, reason: 'unavailable' };
  } catch {
    return { allowed: false, reason: 'unavailable' };
  }
}

export function reportExportDeniedMessage(reason: ReportExportDenialReason): string {
  return reason === 'premium_required'
    ? ENTITLEMENT_COPY.reportLockedToast
    : ENTITLEMENT_COPY.reportCheckFailedToast;
}

export function notifyReportExportDenied(reason: ReportExportDenialReason): void {
  const message = reportExportDeniedMessage(reason);
  if (reason === 'premium_required') toast.info(message);
  else toast.error(message);
}

/** Runs `action` only after the server allows a paid-report export. Shows the denial toast otherwise. */
export async function withAuthorizedReportExport(
  client: ReportExportClient,
  farmId: string | null | undefined,
  reportType: string,
  action: () => void | Promise<void>,
): Promise<boolean> {
  const decision = await authorizeReportExport(client, farmId, reportType);
  if (!decision.allowed) {
    notifyReportExportDenied(decision.reason);
    return false;
  }
  await action();
  return true;
}
