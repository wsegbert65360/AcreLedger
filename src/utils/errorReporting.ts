import { Capacitor } from '@capacitor/core';

/**
 * Client crash reporting. Inactive unless VITE_ERROR_REPORTING_DSN is set.
 * No vendor SDK and no network call when the variable is empty.
 *
 * The DSN is either a plain HTTPS collector (receives the JSON report) or a
 * Sentry DSN (`https://<public key>@<host>/<project id>`), which is sent as a
 * minimal Sentry envelope. Both paths send the same redacted, clipped fields:
 * no user id, email, farm data, request bodies, or breadcrumbs.
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
/** Per page load: at most this many reports, and each distinct error once. */
export const MAX_REPORTS_PER_PAGE = 10;
const sentFingerprints = new Set<string>();

/** Test hook: forget what this page load has already sent. */
export function resetErrorReportLimits(): void {
  sentFingerprints.clear();
}
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
    // Auth material and other secrets in query strings or header-like pairs.
    .replace(
      /([?&#](?:code|access_token|refresh_token|token|apikey|api_key|key|password|secret|authorization)=)[^&\s#]+/gi,
      '$1[redacted]',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/(?<!\d)(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[redacted-phone]')
    // Inline attachments (data URIs, e.g. spray-note photos) and any long
    // base64-looking run must never leave the device.
    .replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^,\s]*)?,[A-Za-z0-9+/=%_-]+/gi, '[redacted-data]')
    .replace(/[A-Za-z0-9+/_-]{200,}={0,2}/g, '[redacted-blob]');
}

type ReportingEndpoint =
  | { kind: 'collector'; url: string }
  | { kind: 'sentry'; url: string; dsn: string };

/**
 * A Sentry DSN carries only the public key as its username, so it is the one
 * allowed form of URL credentials. The envelope URL authenticates with the
 * same public key, as Sentry's browser SDK does.
 */
function parseSentryDsn(url: URL): ReportingEndpoint | null {
  if (!url.username || url.password || url.search || url.hash) return null;
  const match = /^(.*)\/(\d+)\/?$/.exec(url.pathname);
  if (!match || !/^[a-f0-9]{16,64}$/i.test(url.username)) return null;
  const [, prefix, projectId] = match;
  const key = encodeURIComponent(url.username);
  return {
    kind: 'sentry',
    url: `${url.origin}${prefix}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`,
    dsn: `${url.protocol}//${url.username}@${url.host}${prefix}/${projectId}`,
  };
}

function reportingEndpoint(): ReportingEndpoint | null {
  const raw = import.meta.env.VITE_ERROR_REPORTING_DSN;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.username) return parseSentryDsn(url);
    if (url.password || url.search || url.hash) return null;
    return { kind: 'collector', url: url.toString() };
  } catch {
    return null;
  }
}

type SentryFrame = { function?: string; filename: string; lineno: number; colno: number; in_app: boolean };

/** Parse V8 (`at fn (file:1:2)`) and Safari/Firefox (`fn@file:1:2`) frames, oldest first. */
export function parseStackFrames(stack: string): SentryFrame[] {
  const frames: SentryFrame[] = [];
  for (const line of stack.split('\n')) {
    const v8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    const gecko = v8 ? null : /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/.exec(line);
    const parts = v8 ?? gecko;
    if (!parts) continue;
    const [, fn, filename, lineno, colno] = parts;
    frames.push({
      ...(fn ? { function: fn } : {}),
      filename,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !filename.includes('/node_modules/'),
    });
  }
  return frames.reverse();
}

function randomEventId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

function isNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

type RedactedReport = {
  source: ClientErrorSource;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  path?: string;
};

function buildSentryEnvelope(report: RedactedReport, dsn: string): string {
  const eventId = randomEventId();
  const native = isNativeRuntime();
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
  const frames = report.stack ? parseStackFrames(report.stack) : [];
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    release: `acreledger@${version}`,
    environment: native ? 'ios-app' : (import.meta.env.VITE_VERCEL_ENV || import.meta.env.MODE || 'unknown'),
    ...(report.path ? { transaction: report.path } : {}),
    tags: { source: report.source, runtime: native ? 'native' : 'web' },
    exception: {
      values: [{
        type: report.name || 'Error',
        value: report.message,
        ...(frames.length ? { stacktrace: { frames } } : {}),
      }],
    },
    extra: {
      ...(report.componentStack ? { componentStack: report.componentStack } : {}),
      ...(report.stack && !frames.length ? { stack: report.stack } : {}),
    },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n') + '\n';
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
    const payload: RedactedReport = {
      source: report.source,
      message,
      name: report.name ? clip(redact(report.name), 80) : undefined,
      stack: report.stack ? clip(redact(report.stack), 2000) : undefined,
      componentStack: report.componentStack ? clip(redact(report.componentStack), 2000) : undefined,
      path: typeof location !== 'undefined' ? location.pathname : undefined,
    };
    // A crash loop or offline retry storm must not flood the provider quota.
    const fingerprint = `${payload.source}|${payload.name ?? ''}|${message}`;
    if (sentFingerprints.has(fingerprint) || sentFingerprints.size >= MAX_REPORTS_PER_PAGE) return;
    sentFingerprints.add(fingerprint);

    const sentry = endpoint.kind === 'sentry';
    void fetch(endpoint.url, {
      method: 'POST',
      // text/plain keeps the Sentry request CORS-simple (no preflight).
      headers: { 'content-type': sentry ? 'text/plain;charset=UTF-8' : 'application/json' },
      body: sentry ? buildSentryEnvelope(payload, endpoint.dsn) : JSON.stringify(payload),
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
