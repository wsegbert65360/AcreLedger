import { supabase } from '@/lib/supabase';

/** Refresh when the access token expires inside this window, or is already expired. */
export const ACCESS_TOKEN_REFRESH_LEEWAY_SEC = 60;

export type SessionLike = {
  access_token?: string | null;
  expires_at?: number | null;
} | null;

export class SignInAgainError extends Error {
  constructor(message = 'Sign in again.') {
    super(message);
    this.name = 'SignInAgainError';
  }
}

/** True when the caller must refresh before sending a bearer token. */
export function sessionNeedsRefresh(session: SessionLike, nowMs = Date.now()): boolean {
  const token = session?.access_token;
  if (!token) return true;
  const expiresAt = session?.expires_at;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return true;
  return expiresAt * 1000 - nowMs <= ACCESS_TOKEN_REFRESH_LEEWAY_SEC * 1000;
}

/**
 * Current access token, refreshing only when it is missing or within the leeway.
 * A failed refresh throws and must not be followed by an unauthenticated request.
 */
export async function freshAccessToken(options?: {
  forceRefresh?: boolean;
  message?: string;
}): Promise<string> {
  const message = options?.message ?? 'Sign in again.';
  if (!options?.forceRefresh) {
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data.session;
      if (!error && session?.access_token && !sessionNeedsRefresh(session)) {
        return session.access_token;
      }
    } catch {
      // Fall through to one refresh. If that fails, the caller stays signed out.
    }
  }

  try {
    const { data, error } = await supabase.auth.refreshSession();
    const token = data.session?.access_token;
    if (error || !token) throw new SignInAgainError(message);
    return token;
  } catch (error) {
    if (error instanceof SignInAgainError) throw error;
    throw new SignInAgainError(message);
  }
}
