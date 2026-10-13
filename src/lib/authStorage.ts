import { Capacitor } from '@capacitor/core';

import { secureStorage } from '@/lib/secureStorage';

export function authStorageKey(): string {
  const raw = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/^['"]|['"]$/g, '');
  let ref = 'placeholder-url';
  try { ref = new URL(raw).hostname.split('.')[0]; } catch { /* Match the client's fallback URL. */ }
  return `sb-${ref}-auth-token`;
}

export async function removePersistedAuthSession(): Promise<void> {
  const key = authStorageKey();
  const remove = async (item: string) => {
    if (Capacitor.isNativePlatform()) await secureStorage.removeItem(item);
    else localStorage.removeItem(item);
  };
  await remove(key);
  for (const suffix of ['-code-verifier', '-user']) {
    // Once the session credential is gone, ancillary cleanup must not prevent
    // the caller from resetting signed-in state.
    await remove(key + suffix).catch(() => console.error('Could not remove ancillary auth storage.'));
  }
}
