import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

/**
 * Storage for credentials and encryption material.
 *
 * Native values live in iOS Keychain / Android Keystore. Existing native
 * Preferences values are migrated on first read, then removed. The browser
 * keeps using Preferences because there is no OS keychain available there.
 */
export const SECURE_VALUE_MISSING = 'Item with given key does not exist';

export function isSecureValueMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(SECURE_VALUE_MISSING);
}

export function isSecureValueCorrupt(error: unknown): boolean {
  const detail = error as { code?: unknown; message?: unknown };
  const text = [detail?.code, detail?.message, error instanceof Error ? error.message : String(error)].join(' ');
  // The installed iOS plugin reports generic "error": that is NOT evidence of
  // corruption. Android forwards exception messages; recognize only permanent
  // invalidation / decrypt failures, never locked or busy key stores.
  return /errSecDecode|-26275|KeyPermanentlyInvalidatedException|key (?:permanently )?invalidated|AEADBadTagException|BadPaddingException|bad decrypt|unable to decrypt|tag mismatch/i.test(text);
}

export const FRESH_INSTALL_FLAG = 'al_secure_storage_install_v1';
let installCheck: Promise<void> | undefined;
export function prepareNativeInstall(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return Promise.resolve();
  if (!installCheck) {
    installCheck = (async () => {
      const { value } = await Preferences.get({ key: FRESH_INSTALL_FLAG });
      if (value) return;
      const raw = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/^['"]|['"]$/g, '');
      let ref = 'placeholder-url';
      try { ref = new URL(raw).hostname.split('.')[0]; } catch { /* Client fallback. */ }
      for (const key of [`sb-${ref}-auth-token`, 'al_local_encryption_key', 'db_enc_key']) {
        try { await SecureStoragePlugin.remove({ key }); }
        catch (error) { if (!isSecureValueMissing(error)) throw error; }
        await Preferences.remove({ key });
      }
      // SQLite keeps a second copy of its passphrase in its own Keychain service.
      const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
      if ((await CapacitorSQLite.isSecretStored()).result) await CapacitorSQLite.clearEncryptionSecret();
      // Set only after all removals succeed. Preferences is removed on uninstall.
      await Preferences.set({ key: FRESH_INSTALL_FLAG, value: '1' });
    })().catch(error => { installCheck = undefined; throw error; });
  }
  return installCheck;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return Preferences.get({ key }).then(result => result.value);
    }

    await prepareNativeInstall();
    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value;
    } catch (error) {
      if (!isSecureValueMissing(error)) {
        // Supabase's session item only; never discard encryption keys or PKCE verifiers.
        if (!/^sb-.+-auth-token$/.test(key)) throw error;
        if (!isSecureValueCorrupt(error)) return null;
        console.error('Unreadable auth session; clearing stored credentials:', error);
        await SecureStoragePlugin.remove({ key }).catch(removeError => {
          console.error('Failed to remove unreadable auth session:', removeError);
        });
        await Preferences.remove({ key }).catch(removeError => {
          console.error('Failed to remove legacy auth session:', removeError);
        });
        return null;
      }

      const legacy = await Preferences.get({ key });
      if (!legacy.value) return null;

      await SecureStoragePlugin.set({ key, value: legacy.value });
      await Preferences.remove({ key }).catch(() => undefined);
      return legacy.value;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
      return;
    }

    await prepareNativeInstall();
    await SecureStoragePlugin.set({ key, value });
    // Clear any legacy plaintext copy after the Keychain write succeeds.
    await Preferences.remove({ key }).catch(() => undefined);
  },

  async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await SecureStoragePlugin.remove({ key });
      } catch (error) {
        if (!isSecureValueMissing(error)) throw error;
      }
    }
    await Preferences.remove({ key });
  },
};
