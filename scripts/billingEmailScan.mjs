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

/** Filename extensions that make `name@file.ext` a path, not an email. */
const ASSET_TLDS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'avif',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'css',
  'js',
  'mjs',
  'cjs',
  'map',
  'json',
  'html',
  'htm',
  'wasm',
]);

const EMAIL_SOURCE =
  '(?<![A-Za-z0-9._%+\\-])[A-Za-z0-9](?:[A-Za-z0-9._%+\\-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,24}(?![A-Za-z0-9-])';

const MINIFIED_LINE_LENGTH = 500;

function createEmailRe() {
  return new RegExp(EMAIL_SOURCE, 'g');
}

function domainOf(address) {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase();
}

function isAssetFilename(address) {
  const tld = address.slice(address.lastIndexOf('.') + 1).toLowerCase();
  return ASSET_TLDS.has(tld);
}

export function isAllowedBillingEmail(address) {
  const normalized = address.toLowerCase();
  if (EXACT_EMAIL_ALLOWLIST.has(normalized)) return true;
  return ALLOWED_EMAIL_DOMAINS.has(domainOf(normalized));
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
    if (isAssetFilename(address) || isAllowedBillingEmail(address)) continue;
    matchCount += 1;
    if (!minified) lineNumbers.push(line);
  }

  if (matchCount === 0) return [];
  if (minified) {
    const noun = matchCount === 1 ? 'match' : 'matches';
    return [`${fileLabel} (${matchCount} ${noun})`];
  }

  /** @type {string[]} */
  const lines = [];
  let previous = 0;
  for (const lineNumber of lineNumbers) {
    if (lineNumber === previous) continue;
    lines.push(`${fileLabel}:${lineNumber}`);
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
    ...reportLines.map((line) => `- ${line}`),
  ].join('\n');
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
