import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { secureStorage } from '@/lib/secureStorage';

const PLACEHOLDER_SUPABASE_URL = 'https://placeholder-url.supabase.co';
const PLACEHOLDER_SUPABASE_ANON_KEY = 'placeholder-key';

function cleanEnvValue(value: unknown): string {
    if (typeof value !== 'string') return '';

    const trimmed = value.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1).trim();
    }

    return trimmed;
}

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

const configuredSupabaseUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL);
const configuredSupabaseAnonKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
const hasValidSupabaseUrl = isValidHttpUrl(configuredSupabaseUrl);

if (!hasValidSupabaseUrl || !configuredSupabaseAnonKey) {
    console.warn(
        'Missing or invalid Supabase env vars - using placeholder values. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for full functionality.'
    );
}

const supabaseUrl = hasValidSupabaseUrl ? configuredSupabaseUrl : PLACEHOLDER_SUPABASE_URL;
const supabaseAnonKey = configuredSupabaseAnonKey || PLACEHOLDER_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = hasValidSupabaseUrl && Boolean(configuredSupabaseAnonKey);

const isNative = Capacitor.isNativePlatform();

// Password-recovery links (/auth?mode=recovery&code=...) are exchanged manually
// by establishWebPasswordRecoverySession(). If the client also auto-detects the
// code on init, it burns the one-time PKCE code first and the manual exchange
// fails with "expired, invalid, or already used". Skip auto-detect on that URL only.
const isRecoveryUrl =
    typeof window !== 'undefined' &&
    window.location.pathname === '/auth' &&
    new URLSearchParams(window.location.search).get('mode') === 'recovery';

// A network "online" signal only proves a link exists; the request can still
// hang forever (dead socket, captive portal, dropped LTE). Without a timeout an
// insert below can block its hook's `isMutating` lock and the caller sees no
// result. Abort after 15s so the hooks can treat it as an unknown outcome and
// re-queue instead of hanging or double-counting grain.
const SUPABASE_FETCH_TIMEOUT_MS = 15000;
// Reads and auth calls can't create an unknown-outcome write, so on slow rural
// links they get a longer cap instead of failing a legitimate large response.
const SUPABASE_READ_TIMEOUT_MS = 60000;

function timeoutFor(input: RequestInfo | URL, init?: RequestInit): number {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (method === 'GET' || method === 'HEAD' || url.includes('/auth/v1/')) return SUPABASE_READ_TIMEOUT_MS;
    return SUPABASE_FETCH_TIMEOUT_MS;
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutFor(input, init));
    // Honor a caller-supplied signal without losing the timeout cap: abort our
    // controller when the caller's signal fires.
    const callerSignal = init?.signal;
    let onCallerAbort: (() => void) | undefined;
    if (callerSignal) {
        if (callerSignal.aborted) {
            controller.abort();
        } else {
            onCallerAbort = () => controller.abort();
            callerSignal.addEventListener('abort', onCallerAbort, { once: true });
        }
    }
    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
        clearTimeout(timeout);
        if (callerSignal && onCallerAbort) callerSignal.removeEventListener('abort', onCallerAbort);
    });
}

// Native auth sessions contain refresh tokens and must stay in the OS secure store.
const nativeStorageAdapter = {
    getItem: (key: string) => secureStorage.getItem(key),
    setItem: (key: string, value: string) => secureStorage.setItem(key, value),
    removeItem: (key: string) => secureStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: fetchWithTimeout,
    },
    auth: {
        storage: isNative ? nativeStorageAdapter : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: !isRecoveryUrl,
        flowType: 'pkce',
    },
});
