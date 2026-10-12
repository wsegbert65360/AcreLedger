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

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return Preferences.get({ key }).then(result => result.value);
    }

    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value;
    } catch (error) {
      if (!isSecureValueMissing(error)) {
        // Supabase's session item only; never discard encryption keys or PKCE verifiers.
        if (!/^sb-.+-auth-token$/.test(key)) throw error;
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
