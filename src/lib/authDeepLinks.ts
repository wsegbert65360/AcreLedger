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
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (!accessToken || !refreshToken) {
    throw new Error('The password recovery link is incomplete or expired.');
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
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
