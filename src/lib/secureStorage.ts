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
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return Preferences.get({ key }).then(result => result.value);
    }

    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value;
    } catch {
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
      } catch {
        // Missing secure values are already in the desired state.
      }
    }
    await Preferences.remove({ key });
  },
};
