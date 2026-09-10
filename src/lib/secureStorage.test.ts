import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@capacitor/core');
  vi.doUnmock('@capacitor/preferences');
  vi.doUnmock('capacitor-secure-storage-plugin');
});

describe('secureStorage', () => {
  it('migrates a legacy native Preferences value into secure storage', async () => {
    const secureGet = vi.fn().mockRejectedValue(new Error('missing'));
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
});
