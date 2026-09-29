/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ErrorBoundary from '@/components/ErrorBoundary';
import {
  handleUnhandledRejection,
  handleWindowError,
  installGlobalErrorHandlers,
  reportClientError,
} from './errorReporting';

function Boom(): never {
  throw new Error('boom-boundary');
}

describe('reportClientError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not call the network when the DSN is unset', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    reportClientError({ source: 'window.onerror', message: 'offline only' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a path-only report to an https collector', async () => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', 'https://errors.example/ingest');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/settings?code=secret-code');
    reportClientError({
      source: 'unhandledrejection',
      message: 'failed ?access_token=abc',
      stack: 'at /auth?code=secret-code',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://errors.example/ingest');
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    const body = JSON.parse(String(init?.body));
    expect(body.path).toBe('/settings');
    expect(body.message).not.toContain('abc');
    expect(body.stack).not.toContain('secret-code');
    expect(JSON.stringify(body)).not.toContain('secret-code');
  });

  it('rejects non-https endpoints and URLs that embed secrets', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const dsn of [
      'http://errors.example/ingest',
      'https://user:pass@errors.example/ingest',
      'https://errors.example/ingest?token=secret',
      'not a url',
    ]) {
      vi.stubEnv('VITE_ERROR_REPORTING_DSN', dsn);
      reportClientError({ source: 'window.onerror', message: 'ignored' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows fetch failures', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', 'https://errors.example/ingest');
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('network down');
    }));
    expect(() => reportClientError({ source: 'window.onerror', message: 'still running' })).not.toThrow();
  });
});

describe('global handlers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('captures window.onerror and unhandledrejection once', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', '');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const remove = installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { message: 'script failed', error: new Error('script failed') }));
    handleWindowError({ message: 'direct', error: new Error('direct') });
    handleUnhandledRejection({ reason: new Error('rejected') });
    const reported = errors.mock.calls.map((call) => String(call[1]));
    expect(reported.filter((line) => line === 'script failed')).toHaveLength(1);
    expect(reported).toContain('direct');
    expect(reported).toContain('rejected');
    remove();
  });
});

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports render crashes and stays silent on the network when no DSN is set', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_DSN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(createElement(ErrorBoundary, null, createElement(Boom)));
    expect(screen.getByText('Initialization Error')).toBeInTheDocument();
    expect(errors).toHaveBeenCalledWith('[client-error] error-boundary:', 'boom-boundary');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
