import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const vercel = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  rewrites: Array<{ source: string; destination: string }>;
};

function headerMap(source: string): Map<string, string> {
  const block = vercel.headers.find(entry => entry.source === source);
  expect(block, `missing vercel.json headers for ${source}`).toBeDefined();
  return new Map((block?.headers ?? []).map(header => [header.key, header.value]));
}

describe('vercel.json security headers', () => {
  const headers = headerMap('/(.*)');

  it('sets HSTS, nosniff, DENY framing, and strict-origin referrer policy', () => {
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sends no report-only CSP (it had nowhere to report; index.html carries the enforced CSP)', () => {
    expect(headers.has('Content-Security-Policy-Report-Only')).toBe(false);
  });
});

describe('vercel.json cache and asset rewrites', () => {
  it('does not rewrite missing hashed assets to index.html', () => {
    const rewrite = vercel.rewrites.find(entry => entry.destination === '/index.html');
    expect(rewrite?.source).toBe('/((?!api/|assets/).*)');
  });

  it('caches hashed assets immutably and keeps the shell uncached', () => {
    expect(headerMap('/assets/(.*)').get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(headerMap('/').get('Cache-Control')).toContain('no-store');
    expect(headerMap('/index.html').get('Cache-Control')).toContain('no-store');
    expect(headerMap('/(sw.js|service-worker.js)').get('Cache-Control')).toContain('no-store');
  });
});
