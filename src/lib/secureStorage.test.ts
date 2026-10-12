import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@capacitor/core');
  vi.doUnmock('@capacitor/preferences');
  vi.doUnmock('capacitor-secure-storage-plugin');
});

describe('secureStorage', () => {
  it('migrates a legacy native Preferences value into secure storage', async () => {
    const secureGet = vi.fn().mockRejectedValue(new Error('Item with given key does not exist'));
    const secureSet = vi.fn().mockResolvedValue(undefined);
    const legacyRemove = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: {
        get: vi.fn().mockResolvedValue({ value: 'legacy-token' }),
        remove: legacyRemove,
      },
    }));
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: { get: secureGet, set: secureSet, remove: vi.fn() },
    }));

    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.getItem('session')).resolves.toBe('legacy-token');
    expect(secureSet).toHaveBeenCalledWith({ key: 'session', value: 'legacy-token' });
    expect(legacyRemove).toHaveBeenCalledWith({ key: 'session' });
  });

  it('preserves the explicit failure path for the database encryption key', async () => {
    const legacyGet = vi.fn();
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: { get: legacyGet, remove: vi.fn() },
    }));
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: {
        get: vi.fn().mockRejectedValue(new Error('error')),
        set: vi.fn(),
        remove: vi.fn(),
      },
    }));

    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.getItem('db_enc_key')).rejects.toThrow('error');
    expect(legacyGet).not.toHaveBeenCalled();
  });

  it('clears an unreadable auth session and returns signed out without migrating plaintext', async () => {
    const legacyGet = vi.fn();
    const legacyRemove = vi.fn().mockResolvedValue(undefined);
    const secureRemove = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: { get: legacyGet, remove: legacyRemove },
    }));
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: {
        get: vi.fn().mockRejectedValue(new Error('Key invalidated')),
        remove: secureRemove,
      },
    }));
    try {
      const { secureStorage } = await import('./secureStorage');
      const key = 'sb-project-auth-token';
      await expect(secureStorage.getItem(key)).resolves.toBeNull();
      expect(secureRemove).toHaveBeenCalledWith({ key });
      expect(legacyRemove).toHaveBeenCalledWith({ key });
      expect(legacyGet).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalled();
      await expect(secureStorage.getItem(`${key}-code-verifier`)).rejects.toThrow('Key invalidated');
      expect(secureRemove).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('does not fall back to plaintext when a native secure write fails', async () => {
    const legacySet = vi.fn();
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: { set: legacySet, remove: vi.fn() },
    }));
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: {
        get: vi.fn(),
        set: vi.fn().mockRejectedValue(new Error('keychain unavailable')),
        remove: vi.fn(),
      },
    }));

    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.setItem('session', 'secret')).rejects.toThrow('keychain unavailable');
    expect(legacySet).not.toHaveBeenCalled();
  });

  it('clears the plaintext copy after a missing Keychain value is removed', async () => {
    const legacyRemove = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: { remove: legacyRemove },
    }));
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn().mockRejectedValue(new Error('Item with given key does not exist')),
      },
    }));

    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.removeItem('session')).resolves.toBeUndefined();
    expect(legacyRemove).toHaveBeenCalledWith({ key: 'session' });
  });

  it('keeps the plaintext copy when a Keychain remove actually fails', async () => {
    const legacyRemove = vi.fn();
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: { remove: legacyRemove },
    }));
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn().mockRejectedValue(new Error('Remove failed')),
      },
    }));

    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.removeItem('session')).rejects.toThrow('Remove failed');
    expect(legacyRemove).not.toHaveBeenCalled();
  });
});
