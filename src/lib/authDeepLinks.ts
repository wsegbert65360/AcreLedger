import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

export const NATIVE_AUTH_SCHEME = 'com.wsegbert.acreledger';

export function getPasswordRecoveryRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return `${NATIVE_AUTH_SCHEME}://auth/recovery`;
  }
  return `${window.location.origin}/auth?mode=recovery`;
}

function isNativeRecoveryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === `${NATIVE_AUTH_SCHEME}:`
      && url.hostname === 'auth'
      && url.pathname === '/recovery';
  } catch {
    return false;
  }
}

async function establishRecoverySession(value: string): Promise<boolean> {
  if (!isNativeRecoveryUrl(value)) return false;

  const url = new URL(value);
  // PKCE only: the code is bound to a verifier stored on this device, so a
  // link crafted by another app cannot sign the user into a foreign session.
  // Raw access/refresh tokens in the URL are deliberately rejected.
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('The password recovery link is incomplete or expired.');
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}

export function listenForNativePasswordRecovery(
  onRecovery: () => void,
  onError: (error: unknown) => void,
): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  let active = true;
  let handledUrl: string | null = null;
  const handleUrl = async (url: string | undefined) => {
    if (!active || !url || handledUrl === url || !isNativeRecoveryUrl(url)) return;
    handledUrl = url;
    try {
      if (await establishRecoverySession(url)) onRecovery();
    } catch (error) {
      handledUrl = null;
      onError(error);
    }
  };

  void CapApp.getLaunchUrl().then(result => handleUrl(result?.url)).catch(onError);
  const listener = CapApp.addListener('appUrlOpen', event => void handleUrl(event.url));

  return () => {
    active = false;
    void listener.then(handle => handle.remove());
  };
}
