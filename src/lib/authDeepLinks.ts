import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

export const NATIVE_AUTH_SCHEME = 'com.wsegbert.acreledger';
const LEGACY_RECOVERY_LINK_ERROR = "This password-reset link is from an older email and can't be used. Request a new reset email and open the newest link.";
const EXPIRED_RECOVERY_LINK_ERROR = 'This password-reset link is expired, invalid, or has already been used. Request a new reset email and open the newest link.';
const MISSING_VERIFIER_RECOVERY_LINK_ERROR = 'This password-reset link was opened in a different browser or app than the one used to request it. Open the newest link in that same browser or app, or request a new reset email there.';

function isMissingPkceVerifier(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  if (candidate.name === 'AuthPKCECodeVerifierMissingError') return true;
  if (candidate.code === 'pkce_code_verifier_not_found') return true;
  return typeof candidate.message === 'string'
    && candidate.message.toLowerCase().includes('code verifier not found');
}

function recoveryLinkError(error: unknown): Error {
  return new Error(
    isMissingPkceVerifier(error)
      ? MISSING_VERIFIER_RECOVERY_LINK_ERROR
      : EXPIRED_RECOVERY_LINK_ERROR,
  );
}

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
    // A PKCE code is bound to a verifier stored on this device, so a link
    // crafted by another app cannot sign the user into a foreign session.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.session) throw recoveryLinkError(error);
    return true;
  }

  const tokenHash = url.searchParams.get('token_hash');
  if (tokenHash && url.searchParams.get('type') === 'recovery') {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data?.session) throw new Error(EXPIRED_RECOVERY_LINK_ERROR);
    return true;
  }

  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.has('access_token') || fragment.has('refresh_token')) {
    throw new Error(LEGACY_RECOVERY_LINK_ERROR);
  }

  throw new Error(EXPIRED_RECOVERY_LINK_ERROR);
}

let handledWebRecoveryUrl: string | null = null;

export async function establishWebPasswordRecoverySession(value = window.location.href): Promise<boolean> {
  const url = new URL(value);
  if (url.pathname !== '/auth' || url.searchParams.get('mode') !== 'recovery') return false;

  if (handledWebRecoveryUrl === url.href) return false;

  handledWebRecoveryUrl = url.href;
  try {
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      // Do not treat an already-signed-in session as this reset. An expired
      // or already-used code must fail even when getSession() has a session.
      if (error || !data?.session) throw recoveryLinkError(error);
      url.searchParams.delete('code');
    } else if (tokenHash && url.searchParams.get('type') === 'recovery') {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      if (error || !data?.session) throw new Error(EXPIRED_RECOVERY_LINK_ERROR);
      url.searchParams.delete('token_hash');
      url.searchParams.delete('type');
    } else {
      const fragment = new URLSearchParams(url.hash.slice(1));
      throw new Error(
        fragment.has('access_token') || fragment.has('refresh_token')
          ? LEGACY_RECOVERY_LINK_ERROR
          : EXPIRED_RECOVERY_LINK_ERROR,
      );
    }
  } catch (error) {
    handledWebRecoveryUrl = null;
    throw error;
  }

  window.history.replaceState(window.history.state, '', url.toString());
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
