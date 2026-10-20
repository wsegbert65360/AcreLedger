/**
 * Always-on scan for email-looking strings in billing sources and the web bundle.
 * This does not read BILLING_ALLOWLIST or VERCEL_ENV. Callers must not print matches.
 */

/** Billing implementation files. Tests are intentionally absent. */
export const BILLING_EMAIL_SOURCE_FILES = Object.freeze([
  'src/lib/billing.ts',
  'src/components/settings/BillingManager.tsx',
  'server/billing.ts',
  'api/billing-eligibility.ts',
  'api/create-checkout-session.ts',
  'api/create-portal-session.ts',
]);

/**
 * Exact addresses permitted anywhere the scan runs.
 * Add a third-party or library address only as that full address, with a
 * one-line reason. Do not allow a whole domain here.
 */
const EXACT_EMAIL_ALLOWLIST = new Set([
  // Public support contact shipped in the client (src/lib/support.ts).
  'acreledgerapp@gmail.com',
]);

/**
 * Placeholder and sentinel domains. The host must match exactly; subdomains
 * are not allowed. No other domain is allowed as a whole.
 */
const ALLOWED_EMAIL_DOMAINS = new Set(['example.com', 'example.invalid']);

/**
 * Full filenames that are assets, not mailboxes. The match must be the entire
 * scanned token. A file extension is not enough: `a@b.com.png` is still an address.
 */
const EXACT_ASSET_ALLOWLIST = new Set([
  // iOS universal 1024pt app icon in AppIcon.appiconset; @2x is Apple's scale marker.
  'AppIcon-512@2x.png',
]);

/** RFC 5322 atext. A local part may start with any of these, not only a letter or digit. */
const ATEXT_CLASS = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]";
/** atext plus `.`, so a match cannot begin in the middle of a local part. */
const LOCAL_BOUNDARY_CLASS = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]";

const EMAIL_SOURCE = [
  `(?<!${LOCAL_BOUNDARY_CLASS})`,
  `${ATEXT_CLASS}(?:${ATEXT_CLASS}|\\.${ATEXT_CLASS}){0,63}`,
  '@',
  '(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+',
  '[A-Za-z]{2,24}',
  '(?![A-Za-z0-9-])',
].join('');

const REDACTED_ADDRESS = '[redacted]';

const MINIFIED_LINE_LENGTH = 500;

function createEmailRe() {
  return new RegExp(EMAIL_SOURCE, 'g');
}

function domainOf(address) {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase();
}

function isAllowedAssetName(address) {
  return EXACT_ASSET_ALLOWLIST.has(address);
}

export function isAllowedBillingEmail(address) {
  const normalized = address.toLowerCase();
  if (EXACT_EMAIL_ALLOWLIST.has(normalized)) return true;
  return ALLOWED_EMAIL_DOMAINS.has(domainOf(normalized));
}

/**
 * Replace address-shaped substrings so a path or file name cannot print one.
 * @param {string} value
 * @returns {string}
 */
export function maskAddressShapedText(value) {
  return value.replace(createEmailRe(), REDACTED_ADDRESS);
}

/**
 * Vite emits minified JS and CSS into dist. Those files are reported as a
 * match count. A non-JS/CSS dist file is treated as minified only when a line
 * is too long for a useful line number.
 * @param {string} repoPath
 * @param {string} text
 */
export function isMinifiedDistFile(repoPath, text) {
  const normalized = repoPath.replaceAll('\\', '/');
  if (!normalized.startsWith('dist/')) return false;
  if (/\.(?:js|mjs|cjs|css)$/i.test(normalized)) return true;
  let lineStart = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      if (i - lineStart >= MINIFIED_LINE_LENGTH) return true;
      lineStart = i + 1;
    }
  }
  return false;
}

/**
 * Report locations of disallowed email-looking strings.
 * The returned lines never include the matched address.
 * Non-minified files use `file:line`. Minified files use `file (N match|matches)`.
 * @param {string} fileLabel
 * @param {string} text
 * @param {{ minified?: boolean }} [options]
 * @returns {string[]}
 */
export function scanTextForDisallowedEmails(fileLabel, text, options = {}) {
  const minified = options.minified === true;
  const re = createEmailRe();
  /** @type {number[]} */
  const lineNumbers = [];
  let matchCount = 0;
  let line = 1;
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    const address = match[0];
    const start = match.index ?? 0;
    if (!minified) {
      for (let i = cursor; i < start; i += 1) {
        if (text.charCodeAt(i) === 10) line += 1;
      }
      cursor = start;
    }
    if (isAllowedAssetName(address) || isAllowedBillingEmail(address)) continue;
    matchCount += 1;
    if (!minified) lineNumbers.push(line);
  }

  if (matchCount === 0) return [];
  const safeLabel = maskAddressShapedText(fileLabel);
  if (minified) {
    const noun = matchCount === 1 ? 'match' : 'matches';
    return [`${safeLabel} (${matchCount} ${noun})`];
  }

  /** @type {string[]} */
  const lines = [];
  let previous = 0;
  for (const lineNumber of lineNumbers) {
    if (lineNumber === previous) continue;
    lines.push(`${safeLabel}:${lineNumber}`);
    previous = lineNumber;
  }
  return lines;
}

/**
 * @param {Array<{ label: string, text: string, minified?: boolean }>} entries
 * @returns {string[]}
 */
export function collectHardcodedEmailReport(entries) {
  /** @type {string[]} */
  const reports = [];
  for (const entry of entries) {
    reports.push(
      ...scanTextForDisallowedEmails(entry.label, entry.text, {
        minified: entry.minified === true,
      }),
    );
  }
  return reports;
}

/**
 * Failure text for the bundle script. `reportLines` must already be locations
 * only; this function does not accept address text.
 * @param {string[]} reportLines
 */
export function formatEmailScanFailure(reportLines) {
  return [
    'hardcoded email check failed. Disallowed email-looking string(s) found:',
    ...reportLines.map((line) => `- ${maskAddressShapedText(line)}`),
  ].join('\n');
}

/**
 * Header plus a `- path` list. Every path goes through `maskAddressShapedText`.
 * @param {string} header
 * @param {string[]} filePaths
 */
function formatMaskedPathFailure(header, filePaths) {
  return [header, ...filePaths.map((filePath) => `- ${maskAddressShapedText(filePath)}`)].join('\n');
}

/**
 * Sentinel hit in dist. `filePaths` are repo paths; address-shaped text is masked.
 * @param {string} label
 * @param {string[]} filePaths
 */
export function formatSentinelBundleFailure(label, filePaths) {
  return formatMaskedPathFailure(
    `${label}: forbidden billing/weather sentinel found in the bundle:`,
    filePaths,
  );
}

/**
 * Client source still mentions the removed allowlist env name.
 * @param {string} envName
 * @param {string[]} filePaths
 */
export function formatClientAllowlistReferenceFailure(envName, filePaths) {
  return formatMaskedPathFailure(`src/ still references ${envName}:`, filePaths);
}

/**
 * Real allowlist entries were found in the built bundle. Paths are masked.
 * The entries themselves are not included.
 * @param {number} matchCount
 * @param {string[]} filePaths
 */
export function formatAllowlistEntryBundleFailure(matchCount, filePaths) {
  return formatMaskedPathFailure(
    `BILLING_ALLOWLIST entries found in the bundle (${matchCount} matching entries):`,
    filePaths,
  );
}

/**
 * A billing source file from the scan list is missing. The path is masked.
 * @param {string} repoPath
 */
export function formatMissingBillingSourceFailure(repoPath) {
  return `hardcoded email check: missing billing source ${maskAddressShapedText(repoPath)}`;
}

/**
 * Real-list bundle scan gate.
 * Production fails when BILLING_ALLOWLIST is missing, empty, or whitespace-only.
 * Outside production, a missing variable skips the scan. A present value, even
 * a blank one, still scans (blank has no entries).
 * @param {{ VERCEL_ENV?: string, BILLING_ALLOWLIST?: string }} env
 * @returns {{ action: 'fail', message: string } | { action: 'skip', message: string } | { action: 'scan' }}
 */
export function resolveBillingAllowlistGuard(env) {
  const raw = env.BILLING_ALLOWLIST;
  const missing = typeof raw !== 'string';
  const blank = missing || raw.trim() === '';
  if (env.VERCEL_ENV === 'production' && blank) {
    return {
      action: 'fail',
      message:
        'BILLING_ALLOWLIST must be set to a non-empty value in Vercel production for the bundle check. Missing, empty, or whitespace-only is not allowed.',
    };
  }
  if (missing) {
    return {
      action: 'skip',
      message: 'BILLING_ALLOWLIST is unset; skipping the real-list bundle scan.',
    };
  }
  return { action: 'scan' };
}
