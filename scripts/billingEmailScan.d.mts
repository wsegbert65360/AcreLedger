export const BILLING_EMAIL_SOURCE_FILES: readonly string[];

export function isAllowedBillingEmail(address: string): boolean;

export function isMinifiedDistFile(repoPath: string, text: string): boolean;

export function scanTextForDisallowedEmails(
  fileLabel: string,
  text: string,
  options?: { minified?: boolean },
): string[];

export function collectHardcodedEmailReport(
  entries: Array<{ label: string; text: string; minified?: boolean }>,
): string[];

export function formatEmailScanFailure(reportLines: string[]): string;

export type BillingAllowlistGuard =
  | { action: 'fail'; message: string }
  | { action: 'skip'; message: string }
  | { action: 'scan' };

export function resolveBillingAllowlistGuard(env: {
  VERCEL_ENV?: string;
  BILLING_ALLOWLIST?: string;
}): BillingAllowlistGuard;
