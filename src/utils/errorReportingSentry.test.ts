import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isErrorReportingConfigured,
  MAX_REPORTS_PER_PAGE,
  parseStackFrames,
  reportClientError,
  resetErrorReportLimits,
} from '@/utils/errorReporting';

const KEY = '0123456789abcdef0123456789abcdef';
const DSN = `https://${KEY}@o12345.ingest.us.sentry.io/4567`;

function sent() {
  const fetchMock = vi.mocked(fetch);
  return fetchMock.mock.calls.map(([url, init]) => {
    const [header, item, event] = String(init?.body).trimEnd().split('\n').map(line => JSON.parse(line));
    return { url: String(url), init, header, item, event };
  });
}

describe('Sentry DSN reporting', () => {
  beforeEach(() => {
    resetErrorReportLimits();
    localStorage.clear();
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', DSN);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts a Sentry envelope to the project envelope endpoint', () => {
    reportClientError({ source: 'window.onerror', name: 'TypeError', message: 'x is undefined' });
    const [call] = sent();
    expect(call.url).toBe(`https://o12345.ingest.us.sentry.io/api/4567/envelope/?sentry_key=${KEY}&sentry_version=7`);
    expect(call.init?.credentials).toBe('omit');
    expect(call.init?.headers).toEqual({ 'content-type': 'text/plain;charset=UTF-8' });
    expect(call.header.dsn).toBe(DSN);
    expect(call.header.event_id).toMatch(/^[a-f0-9]{32}$/);
    expect(call.item).toEqual({ type: 'event' });
    expect(call.event).toMatchObject({
      event_id: call.header.event_id,
      platform: 'javascript',
      level: 'error',
      tags: { source: 'window.onerror', runtime: 'web' },
      exception: { values: [{ type: 'TypeError', value: 'x is undefined' }] },
    });
    expect(call.event.release).toMatch(/^acreledger@/);
  });

  it('keeps redaction and sends no user identity', () => {
    window.history.replaceState({}, '', '/auth?mode=recovery&code=secret-code');
    reportClientError({
      source: 'error-boundary',
      message: 'save failed for farmer@example.com ?access_token=zz-token-qq',
      stack: 'Error\n    at save (https://app.example/assets/index.js?code=secret-code:10:5)',
      componentStack: 'in Field (call 555-123-4567)',
    });
    const body = String(vi.mocked(fetch).mock.calls[0][1]?.body);
    expect(body).not.toMatch(/farmer@example\.com|zz-token-qq|secret-code|555-123-4567/);
    const [{ event }] = sent();
    expect(event.transaction).toBe('/auth');
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
  });

  it('sends each distinct error once and caps reports per page', () => {
    reportClientError({ source: 'window.onerror', message: 'same' });
    reportClientError({ source: 'window.onerror', message: 'same' });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i += 1) {
      reportClientError({ source: 'window.onerror', message: `distinct ${i}` });
    }
    expect(fetch).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });

  it.each([
    ['a password in the DSN', `https://${KEY}:secret@o1.ingest.sentry.io/4567`],
    ['a non-hex key', 'https://not-a-key@o1.ingest.sentry.io/4567'],
    ['a non-numeric project', `https://${KEY}@o1.ingest.sentry.io/project`],
    ['plain http', `http://${KEY}@o1.ingest.sentry.io/4567`],
    ['a query string', `https://${KEY}@o1.ingest.sentry.io/4567?x=1`],
  ])('rejects %s', (_label, dsn) => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', dsn);
    expect(isErrorReportingConfigured()).toBe(false);
    reportClientError({ source: 'window.onerror', message: 'nope' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('supports a self-hosted DSN path prefix', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', `https://${KEY}@sentry.example.com/errors/42`);
    reportClientError({ source: 'window.onerror', message: 'prefixed' });
    expect(sent()[0].url).toBe(`https://sentry.example.com/errors/api/42/envelope/?sentry_key=${KEY}&sentry_version=7`);
  });
});

describe('parseStackFrames', () => {
  it('parses V8 frames oldest first', () => {
    const frames = parseStackFrames('TypeError: x\n    at inner (https://a.app/assets/index.js:10:5)\n    at https://a.app/assets/vendor.js:2:3');
    expect(frames).toEqual([
      { filename: 'https://a.app/assets/vendor.js', lineno: 2, colno: 3, in_app: true },
      { function: 'inner', filename: 'https://a.app/assets/index.js', lineno: 10, colno: 5, in_app: true },
    ]);
  });

  it('parses Safari frames', () => {
    expect(parseStackFrames('save@capacitor://localhost/assets/index.js:7:9')).toEqual([
      { function: 'save', filename: 'capacitor://localhost/assets/index.js', lineno: 7, colno: 9, in_app: true },
    ]);
  });

  it('falls back to no frames for unparseable stacks', () => {
    expect(parseStackFrames('just a message')).toEqual([]);
  });
});
