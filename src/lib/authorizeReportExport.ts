import { isPaidReport, isPremiumRequiredError } from '@/lib/entitlements';

type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string | null; message?: string | null } | null }>;

export interface ReportExportClient {
  rpc: unknown;
}

/**
 * Asks the server before a Pro report is saved, shared or printed. The server
 * (assert_premium, feature 'reports') decides: it is a no-op in `off`, logs the
 * attempt in `shadow`, and raises P0402 in `enforce` for a free farm.
 *
 * Only an explicit premium_required answer blocks. Offline or any other error
 * fails open so missing billing data never becomes a paywall and field work
 * is never blocked. The report itself is still built on the device, so this is
 * an audited server check, not server-side rendering.
 */
export async function authorizeReportExport(
  client: ReportExportClient,
  farmId: string | null | undefined,
  reportType: string,
): Promise<boolean> {
  if (!isPaidReport(reportType) || !farmId) return true;
  try {
    const { error } = await (client.rpc as RpcCall)('assert_premium', {
      p_farm_id: farmId,
      p_feature: 'reports',
    });
    return !isPremiumRequiredError(error);
  } catch {
    return true;
  }
}
