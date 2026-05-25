import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});
