import type { Session } from '@supabase/supabase-js';

import { removePersistedAuthSession } from '@/lib/authStorage';
import { supabase } from '@/lib/supabase';

export type SignOutResult = {
  signedOut: boolean;
  serverPending: boolean;
  cacheCleared?: boolean;
};
export type SignOutScope = 'local' | 'global';

const pendingRevocations = new Map<string, SignOutScope>();
let retrying = false;

// Keep only the access token in memory; never retain a refresh token or restore
// a session to retry revocation. A reload drops this best-effort retry queue.
export async function retryPendingSignOuts(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    for (const [token, scope] of pendingRevocations) {
      try {
        const { error } = await supabase.auth.admin.signOut(token, scope);
        if (!error || [401, 403, 404].includes(error.status ?? 0)) pendingRevocations.delete(token);
      } catch {
        // Retry when connectivity returns.
      }
    }
  } finally {
    retrying = false;
  }
}
if (typeof window !== 'undefined') window.addEventListener('online', () => void retryPendingSignOuts());

export async function endAuthSession(session: Session | null | undefined, scope: SignOutScope = 'local'): Promise<SignOutResult> {
  let serverPending = false;
  try {
    const { error } = await supabase.auth.signOut({ scope });
    serverPending = Boolean(error);
  } catch {
    serverPending = true;
  }
  if (serverPending) {
    // If removing persisted credentials fails, callers must preserve their
    // offline queue and report failure rather than claiming local sign-out.
    await removePersistedAuthSession();
    if (session?.access_token) {
      pendingRevocations.set(session.access_token, scope);
      void retryPendingSignOuts();
    }
  }
  return { signedOut: true, serverPending };
}
