import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isErrorReportingOptedOut,
  reportClientError,
  setErrorReportingOptOut,
} from '@/utils/errorReporting';

describe('crash report opt-out and scrubbing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', 'https://reports.example.com/ingest');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a report by default', () => {
    reportClientError({ source: 'window.onerror', message: 'boom' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends nothing once the user opts out, and remembers the choice', () => {
    setErrorReportingOptOut(true);
    expect(isErrorReportingOptedOut()).toBe(true);
    reportClientError({ source: 'window.onerror', message: 'boom' });
    expect(fetch).not.toHaveBeenCalled();

    setErrorReportingOptOut(false);
    expect(isErrorReportingOptedOut()).toBe(false);
    reportClientError({ source: 'window.onerror', message: 'boom' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('strips data URIs and long base64 runs from the payload', () => {
    const blob = 'A'.repeat(300);
    reportClientError({
      source: 'error-boundary',
      message: `note failed data:image/png;base64,${blob} and ${blob}`,
      stack: `at x (data:image/jpeg;base64,${blob})`,
    });
    const body = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).not.toContain(blob);
    expect(body).toContain('[redacted-data]');
  });
});
