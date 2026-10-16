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
  const csp = headers.get('Content-Security-Policy-Report-Only') ?? '';

  it('sets HSTS, nosniff, DENY framing, and strict-origin referrer policy', () => {
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('uses report-only CSP with frame-ancestors none and current app origins', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://rtzqswpmhlbrbxjwyywl.supabase.co');
    expect(csp).toContain('wss://rtzqswpmhlbrbxjwyywl.supabase.co');
    expect(csp).toContain('https://js.stripe.com');
    expect(csp).toContain('https://checkout.stripe.com');
    expect(csp).toContain('https://api.stripe.com');
    expect(csp).toContain('https://server.arcgisonline.com');
    expect(csp).toContain('https://weather.visualcrossing.com');
    expect(csp).toContain('https://rain-api.vercel.app');
    expect(csp).toContain('https://www.windy.com');
    expect(csp).toContain('https://nominatim.openstreetmap.org');
    expect(csp).toContain('https://itunes.apple.com');
    expect(csp).toContain('https://cdnjs.cloudflare.com');
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
