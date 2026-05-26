import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

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

// Custom storage adapter for Native (iOS/Android) to use Keychain/Preferences instead of localStorage
const nativeStorageAdapter = {
    getItem: (key: string) => {
        return Preferences.get({ key }).then(res => res.value).catch(() => null);
    },
    setItem: (key: string, value: string) => {
        return Preferences.set({ key, value });
    },
    removeItem: (key: string) => {
        return Preferences.remove({ key });
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: isNative ? nativeStorageAdapter : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});
