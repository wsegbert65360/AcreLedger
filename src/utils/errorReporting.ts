/**
 * Client crash reporting. Inactive unless VITE_ERROR_REPORTING_DSN is set.
 * No vendor SDK and no network call when the variable is empty.
 */

export type ClientErrorSource = 'error-boundary' | 'window.onerror' | 'unhandledrejection';

export type ClientErrorReport = {
  source: ClientErrorSource;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
};

const INSTALL_FLAG = '__acreLedgerErrorReportingInstalled';
const OPT_OUT_KEY = 'al_error_reporting_optout';

/** True when the user has switched crash reports off on this device. */
export function isErrorReportingOptedOut(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setErrorReportingOptOut(optedOut: boolean): void {
  try {
    if (optedOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Storage unavailable: the choice can't persist, but nothing else breaks.
  }
}

/** True when this build has a reporting endpoint configured at all. */
export function isErrorReportingConfigured(): boolean {
  return reportingEndpoint() !== null;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function redact(value: string): string {
  return value
    // Auth material in URLs.
    .replace(
      /([?&#](?:code|access_token|refresh_token|token|apikey|api_key)=)[^&\s#]+/gi,
      '$1[redacted]',
    )
    // Inline attachments (data URIs, e.g. spray-note photos) and any long
    // base64-looking run must never leave the device.
    .replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^,\s]*)?,[A-Za-z0-9+/=%_-]+/gi, '[redacted-data]')
    .replace(/[A-Za-z0-9+/_-]{200,}={0,2}/g, '[redacted-blob]');
}

function reportingEndpoint(): string | null {
  const raw = import.meta.env.VITE_ERROR_REPORTING_DSN;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function reportClientError(report: ClientErrorReport): void {
  let message = 'Unknown client error';
  try {
    message = clip(redact(report.message || 'Unknown client error'), 500);
  } catch {
    // Reporting must never take down the page.
  }
  console.error(`[client-error] ${report.source}:`, message);
  const endpoint = reportingEndpoint();
  if (!endpoint || isErrorReportingOptedOut()) return;

  try {
    const payload = {
      source: report.source,
      message,
      name: report.name ? clip(redact(report.name), 80) : undefined,
      stack: report.stack ? clip(redact(report.stack), 2000) : undefined,
      componentStack: report.componentStack ? clip(redact(report.componentStack), 2000) : undefined,
      path: typeof location !== 'undefined' ? location.pathname : undefined,
    };
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      redirect: 'error',
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting must never take down the page.
  }
}

export function handleWindowError(event: Pick<ErrorEvent, 'message' | 'error'>): void {
  const error = event.error;
  reportClientError({
    source: 'window.onerror',
    message: (error instanceof Error ? error.message : event.message) || 'window error',
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function handleUnhandledRejection(event: Pick<PromiseRejectionEvent, 'reason'>): void {
  const reason: unknown = event.reason;
  reportClientError({
    source: 'unhandledrejection',
    message: reason instanceof Error ? reason.message : String(reason),
    name: reason instanceof Error ? reason.name : 'UnhandledRejection',
    stack: reason instanceof Error ? reason.stack : undefined,
  });
}

export function installGlobalErrorHandlers(target: Window = window): () => void {
  const holder = target as Window & { [INSTALL_FLAG]?: boolean };
  if (holder[INSTALL_FLAG]) return () => undefined;
  holder[INSTALL_FLAG] = true;
  const onError = (event: Event) => handleWindowError(event as ErrorEvent);
  const onRejection = (event: Event) => handleUnhandledRejection(event as PromiseRejectionEvent);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
    delete holder[INSTALL_FLAG];
  };
}
