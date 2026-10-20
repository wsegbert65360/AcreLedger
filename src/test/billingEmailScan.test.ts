import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BILLING_EMAIL_SOURCE_FILES,
  collectHardcodedEmailReport,
  formatEmailScanFailure,
  isMinifiedDistFile,
  resolveBillingAllowlistGuard,
  scanTextForDisallowedEmails,
} from '../../scripts/billingEmailScan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Distinctive address used only as scanner input. Failure text must omit it. */
const PLANTED = 'planted-billing-scan@leak-check.test';

function failureText(fileLabel: string, text: string, minified = false): string {
  return formatEmailScanFailure(scanTextForDisallowedEmails(fileLabel, text, { minified }));
}

describe('hardcoded billing email scan', () => {
  it('fails a planted address and keeps that address out of the output', () => {
    const text = `support acreledgerapp@gmail.com\ncontact ${PLANTED} today\n`;
    const report = scanTextForDisallowedEmails('src/lib/billing.ts', text);
    const output = formatEmailScanFailure(report);

    expect(report).toEqual(['src/lib/billing.ts:2']);
    expect(output).toContain('src/lib/billing.ts:2');
    expect(output).not.toContain(PLANTED);
    expect(output).not.toContain('planted-billing-scan');
    expect(output).not.toContain('leak-check');
    expect(output).not.toMatch(/@/);
  });

  it('passes the support address and example.com / example.invalid addresses', () => {
    const text = [
      'acreledgerapp@gmail.com',
      'AcreLedgerApp@Gmail.com',
      'farm@example.com',
      'Farmer@Example.COM',
      'zzsentinel-allowlist@example.invalid',
      'ZZ@Example.Invalid',
      'filename: "AppIcon-512@2x.png"',
      '+farmer@example.com',
      "first.last+tag@example.invalid",
    ].join('\n');

    expect(scanTextForDisallowedEmails('src/components/settings/BillingManager.tsx', text)).toEqual(
      [],
    );
  });

  it('matches local parts that start with + or another RFC 5322 atext character', () => {
    const leadChars = ['!', '#', '$', '%', '&', "'", '*', '+', '/', '=', '?', '^', '_', '`', '{', '|', '}', '~', '-'];
    const samples = [
      ...leadChars.map((char) => `${char}acreledgerapp@gmail.com`),
      'a.acreledgerapp@gmail.com',
      'first.last@leak-check.test',
      '+alias@leak-check.test',
      "user!#$%&'*+/=?^_`{|}~-tag@leak-check.test",
    ];

    for (const sample of samples) {
      const output = failureText('src/lib/billing.ts', sample);
      expect(output).toContain('src/lib/billing.ts:1');
      expect(output).not.toContain(sample);
      expect(output).not.toContain('acreledgerapp');
      expect(output).not.toContain('leak-check');
      expect(output).not.toMatch(/@/);
    }
  });

  it('rejects a real address with a .png or .map suffix and allows an exact asset name', () => {
    expect(
      scanTextForDisallowedEmails(
        'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json',
        '{ "filename" : "AppIcon-512@2x.png" }',
      ),
    ).toEqual([]);

    const samples = ['a@b.com.png', 'a@b.com.map', 'farmer@example.com.png', 'farmer@example.com.map'];
    for (const sample of samples) {
      const output = failureText('api/billing-eligibility.ts', sample);
      expect(output).toContain('api/billing-eligibility.ts:1');
      expect(output).not.toContain(sample);
      expect(output).not.toContain('example.com');
      expect(output).not.toMatch(/@/);
    }
  });

  it('rejects lookalike addresses and domains other than the example domains', () => {
    const samples = [
      'other@gmail.com',
      'not-acreledgerapp@gmail.com',
      'acreledgerapp@gmail.com.attacker.com',
      'user@mail.example.com',
      'user@example.com.evil.com',
      'user@example.invalid.evil.com',
      'user@2x.com',
    ];

    for (const sample of samples) {
      const output = failureText('api/billing-eligibility.ts', sample);
      expect(output).toContain('api/billing-eligibility.ts:1');
      expect(output).not.toContain(sample);
      expect(output).not.toContain(sample.split('@')[0]);
      expect(output).not.toMatch(/@/);
    }
  });

  it('masks address-shaped text in printed file names and paths', () => {
    const minifiedReport = scanTextForDisallowedEmails(`dist/${PLANTED}/index.js`, PLANTED, {
      minified: true,
    });
    const minifiedOutput = formatEmailScanFailure(minifiedReport);
    expect(minifiedOutput).toContain('[redacted]');
    expect(minifiedOutput).toContain('match');
    expect(minifiedOutput).not.toContain(PLANTED);
    expect(minifiedOutput).not.toContain('planted-billing-scan');
    expect(minifiedOutput).not.toContain('leak-check');
    expect(minifiedOutput).not.toMatch(/@/);

    const lineReport = scanTextForDisallowedEmails(`notes/${PLANTED}/billing.ts`, `x\n${PLANTED}\n`);
    const lineOutput = formatEmailScanFailure(lineReport);
    expect(lineOutput).toContain('[redacted]');
    expect(lineOutput).toContain(':2');
    expect(lineOutput).not.toContain(PLANTED);
    expect(lineOutput).not.toMatch(/@/);

    const formatted = formatEmailScanFailure([`public/${PLANTED}.map:9`]);
    expect(formatted).toContain('[redacted]');
    expect(formatted).toContain(':9');
    expect(formatted).not.toContain(PLANTED);
    expect(formatted).not.toContain('planted-billing-scan');
    expect(formatted).not.toContain('leak-check');
    expect(formatted).not.toMatch(/@/);
  });

  it('reports minified dist files as a match count and omits the address', () => {
    const text = `${PLANTED} ${PLANTED}`;
    const report = scanTextForDisallowedEmails('dist/assets/index.js', text, { minified: true });
    const output = formatEmailScanFailure(report);

    expect(report).toEqual(['dist/assets/index.js (2 matches)']);
    expect(output).toContain('dist/assets/index.js (2 matches)');
    expect(output).not.toContain(PLANTED);
    expect(output).not.toMatch(/@/);
  });

  it('combines source line reports and minified counts without echoing addresses', () => {
    const report = collectHardcodedEmailReport([
      { label: 'server/billing.ts', text: `a\n${PLANTED}\n` },
      { label: 'dist/assets/app.js', text: PLANTED, minified: true },
    ]);
    const output = formatEmailScanFailure(report);

    expect(report).toEqual(['server/billing.ts:2', 'dist/assets/app.js (1 match)']);
    expect(output).not.toContain(PLANTED);
    expect(output).not.toMatch(/@/);
  });

  it('treats bundled js and css as minified and leaves source paths as line reports', () => {
    const longLine = 'x'.repeat(500);
    expect(isMinifiedDistFile('dist/assets/index.js', 'var a=1;')).toBe(true);
    expect(isMinifiedDistFile('dist/assets/index.css', 'body{}')).toBe(true);
    expect(isMinifiedDistFile('dist/index.html', '<html></html>')).toBe(false);
    expect(isMinifiedDistFile('dist/index.html', longLine)).toBe(true);
    expect(isMinifiedDistFile('src/lib/billing.ts', longLine)).toBe(false);
  });

  it('scans the billing source files and not their tests', () => {
    expect([...BILLING_EMAIL_SOURCE_FILES]).toEqual([
      'src/lib/billing.ts',
      'src/components/settings/BillingManager.tsx',
      'server/billing.ts',
      'api/billing-eligibility.ts',
      'api/create-checkout-session.ts',
      'api/create-portal-session.ts',
    ]);

    for (const rel of BILLING_EMAIL_SOURCE_FILES) {
      const text = readFileSync(resolve(root, rel), 'utf8');
      expect(scanTextForDisallowedEmails(rel, text)).toEqual([]);
    }
  });
});

describe('production BILLING_ALLOWLIST guard', () => {
  const failure = {
    action: 'fail' as const,
    message:
      'BILLING_ALLOWLIST must be set to a non-empty value in Vercel production for the bundle check. Missing, empty, or whitespace-only is not allowed.',
  };

  it('fails production when the allowlist is missing, empty, or whitespace-only', () => {
    expect(resolveBillingAllowlistGuard({ VERCEL_ENV: 'production' })).toEqual(failure);
    expect(resolveBillingAllowlistGuard({ VERCEL_ENV: 'production', BILLING_ALLOWLIST: '' })).toEqual(
      failure,
    );
    for (const blank of [' ', '\t', '\n', ' \t\r\n ', '\u00a0']) {
      expect(
        resolveBillingAllowlistGuard({ VERCEL_ENV: 'production', BILLING_ALLOWLIST: blank }),
      ).toEqual(failure);
    }
  });

  it('scans production when the allowlist has a non-blank value and does not echo it', () => {
    const decision = resolveBillingAllowlistGuard({
      VERCEL_ENV: 'production',
      BILLING_ALLOWLIST: `  ${PLANTED}  `,
    });
    expect(decision).toEqual({ action: 'scan' });
    expect(JSON.stringify(decision)).not.toContain(PLANTED);
    expect(JSON.stringify(decision)).not.toMatch(/@/);
  });

  it('skips outside production only when the variable is missing', () => {
    expect(resolveBillingAllowlistGuard({})).toEqual({
      action: 'skip',
      message: 'BILLING_ALLOWLIST is unset; skipping the real-list bundle scan.',
    });
    expect(resolveBillingAllowlistGuard({ VERCEL_ENV: 'preview' })).toEqual({
      action: 'skip',
      message: 'BILLING_ALLOWLIST is unset; skipping the real-list bundle scan.',
    });
    expect(resolveBillingAllowlistGuard({ BILLING_ALLOWLIST: '' })).toEqual({ action: 'scan' });
    expect(resolveBillingAllowlistGuard({ BILLING_ALLOWLIST: '   ' })).toEqual({ action: 'scan' });
    expect(resolveBillingAllowlistGuard({ VERCEL_ENV: 'preview', BILLING_ALLOWLIST: 'user-1' })).toEqual({
      action: 'scan',
    });
  });
});
