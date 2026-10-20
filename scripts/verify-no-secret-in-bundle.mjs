import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BILLING_EMAIL_SOURCE_FILES,
  collectHardcodedEmailReport,
  formatAllowlistEntryBundleFailure,
  formatClientAllowlistReferenceFailure,
  formatEmailScanFailure,
  formatMissingBillingSourceFailure,
  formatSentinelBundleFailure,
  isMinifiedDistFile,
  resolveBillingAllowlistGuard,
} from './billingEmailScan.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const srcRoot = resolve(projectRoot, 'src');
const viteBin = resolve(projectRoot, 'node_modules/vite/bin/vite.js');

const SENTINEL = 'ZZSENTINELVCKEY0000';
const BILLING_ALLOWLIST_ENV_NAME = 'VITE_BILLING_ALLOWLIST';
const BILLING_ALLOWLIST_SENTINEL = 'zzsentinel-allowlist@example.invalid';
const DUMMY_PROXY_URL = 'https://example.invalid';

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const entry = resolve(directory, name);
    return statSync(entry).isDirectory() ? walk(entry) : [entry];
  });
}

function toRepoPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join('/');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function scanDistForNeedles(label, needles) {
  if (!existsSync(distRoot)) {
    fail(`${label}: dist is missing after the Vite build.`);
  }

  const hits = [];
  for (const file of walk(distRoot)) {
    const contents = readFileSync(file);
    for (const needle of needles) {
      if (contents.includes(needle)) {
        hits.push(toRepoPath(file));
        break;
      }
    }
  }

  if (hits.length > 0) {
    fail(formatSentinelBundleFailure(label, hits));
  }

  console.log(`${label}: no sentinel in dist.`);
}

function scanSrcForBillingAllowlistName() {
  if (!existsSync(srcRoot)) {
    fail('src/ is missing; cannot scan for client allowlist references.');
  }

  const hits = [];
  for (const file of walk(srcRoot)) {
    if (readFileSync(file, 'utf8').includes(BILLING_ALLOWLIST_ENV_NAME)) {
      hits.push(toRepoPath(file));
    }
  }

  if (hits.length > 0) {
    fail(formatClientAllowlistReferenceFailure(BILLING_ALLOWLIST_ENV_NAME, hits));
  }

  console.log(`src/: no ${BILLING_ALLOWLIST_ENV_NAME} references.`);
}

function parseAllowlistEntries(raw) {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function scanDistForAllowlistEntries() {
  if (!existsSync(distRoot)) {
    fail('normal build: dist is missing after the Vite build.');
  }

  const raw = process.env.BILLING_ALLOWLIST;
  const entries = parseAllowlistEntries(typeof raw === 'string' ? raw : '');
  if (entries.length === 0) {
    console.log('normal build: BILLING_ALLOWLIST has no entries to scan.');
    return;
  }

  const matchingFiles = [];
  let matchCount = 0;
  for (const file of walk(distRoot)) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    let fileMatched = false;
    for (const entry of entries) {
      if (text.includes(entry.toLowerCase())) {
        matchCount += 1;
        fileMatched = true;
      }
    }
    if (fileMatched) matchingFiles.push(toRepoPath(file));
  }

  if (matchCount > 0) {
    fail(formatAllowlistEntryBundleFailure(matchCount, matchingFiles));
  }

  console.log('normal build: no BILLING_ALLOWLIST entries in dist.');
}

function scanHardcodedBillingEmails() {
  /** @type {Array<{ label: string, text: string, minified?: boolean }>} */
  const entries = [];
  for (const rel of BILLING_EMAIL_SOURCE_FILES) {
    const abs = resolve(projectRoot, rel);
    if (!existsSync(abs)) {
      fail(formatMissingBillingSourceFailure(rel));
    }
    entries.push({ label: rel, text: readFileSync(abs, 'utf8'), minified: false });
  }

  if (!existsSync(distRoot)) {
    fail('hardcoded email check: dist is missing after the web Vite build.');
  }

  for (const file of walk(distRoot)) {
    const rel = toRepoPath(file);
    const text = readFileSync(file, 'utf8');
    entries.push({ label: rel, text, minified: isMinifiedDistFile(rel, text) });
  }

  const reports = collectHardcodedEmailReport(entries);
  if (reports.length > 0) {
    fail(formatEmailScanFailure(reports));
  }

  console.log('hardcoded email check: no disallowed addresses in billing sources or web dist.');
}

function runViteBuild(label, extraEnv) {
  console.log(`${label}: building...`);
  execFileSync(process.execPath, [viteBin, 'build', ...extraEnv.args], {
    cwd: projectRoot,
    env: extraEnv.env,
    stdio: 'inherit',
  });
}

if (!existsSync(viteBin)) {
  fail('vite is not installed (node_modules/vite/bin/vite.js missing).');
}

scanSrcForBillingAllowlistName();

const sentinelEnv = {
  ...process.env,
  VITE_VISUALCROSSING_KEY: SENTINEL,
  [BILLING_ALLOWLIST_ENV_NAME]: BILLING_ALLOWLIST_SENTINEL,
};

const billingSentinelNeedles = [SENTINEL, BILLING_ALLOWLIST_SENTINEL, BILLING_ALLOWLIST_ENV_NAME];

runViteBuild('web', { args: [], env: sentinelEnv });
scanDistForNeedles('web', billingSentinelNeedles);
// Always on: not gated by VERCEL_ENV or BILLING_ALLOWLIST. Must run before the
// capacitor build replaces dist, because the email scan covers the web build.
scanHardcodedBillingEmails();

runViteBuild('capacitor', {
  args: ['--mode', 'capacitor'],
  env: {
    ...sentinelEnv,
    VITE_WEATHER_PROXY_URL: DUMMY_PROXY_URL,
    // Capacitor mode (PR #57) refuses a missing Supabase URL/anon key.
    // Dummy values only — this scan is for the Visual Crossing sentinel.
    VITE_SUPABASE_URL: DUMMY_PROXY_URL,
    VITE_SUPABASE_ANON_KEY: 'bundle-scan-anon-key',
  },
});
scanDistForNeedles('capacitor', billingSentinelNeedles);

console.log('Visual Crossing sentinel is absent from web and capacitor bundles.');
console.log('Billing allowlist sentinel is absent from web and capacitor bundles.');

// Always fail if the client env name leaked into dist (sentinel builds above).
// The real-list email/id scan is strict only in Vercel production: fail when
// BILLING_ALLOWLIST is missing, empty, or whitespace-only there; elsewhere
// warn and skip when the variable is unset. The hardcoded email scan above
// already ran and does not depend on this guard.
const billingAllowlistGuard = resolveBillingAllowlistGuard(process.env);
if (billingAllowlistGuard.action === 'fail') {
  fail(billingAllowlistGuard.message);
}
if (billingAllowlistGuard.action === 'skip') {
  console.warn(billingAllowlistGuard.message);
} else {
  const normalEnv = { ...process.env };
  delete normalEnv[BILLING_ALLOWLIST_ENV_NAME];
  runViteBuild('normal', { args: [], env: normalEnv });
  scanDistForNeedles('normal', [BILLING_ALLOWLIST_ENV_NAME]);
  scanDistForAllowlistEntries();
}
