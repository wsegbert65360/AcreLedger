import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sqlite = { isDatabase: vi.fn(), isSecretStored: vi.fn(), clearEncryptionSecret: vi.fn() };
vi.doMock('@capacitor-community/sqlite', () => ({ CapacitorSQLite: sqlite }));
const plugin = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
const prefs = { keys: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() };
let platform = 'ios';
vi.doMock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform },
}));
vi.doMock('@capacitor/preferences', () => ({ Preferences: prefs }));
vi.doMock('capacitor-secure-storage-plugin', () => ({ SecureStoragePlugin: plugin }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  platform = 'ios';
  sqlite.isDatabase.mockResolvedValue({ result: false });
  prefs.keys.mockResolvedValue({ keys: [] });
  sqlite.isSecretStored.mockResolvedValue({ result: true });
  sqlite.clearEncryptionSecret.mockResolvedValue(undefined);
  plugin.remove.mockResolvedValue(undefined);
  plugin.get.mockResolvedValue({ value: 'token' });
  prefs.get.mockResolvedValue({ value: null });
  prefs.set.mockResolvedValue(undefined);
  prefs.remove.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('native credential retention and install boundary', () => {
  it.each(['errSecInteractionNotAllowed', 'Keystore busy', 'error'])('preserves credentials on transient/unknown error: %s', async message => {
    prefs.get.mockResolvedValue({ value: '1' });
    plugin.get.mockRejectedValue(new Error(message));
    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.getItem('sb-project-auth-token')).resolves.toBeNull();
    expect(plugin.remove).not.toHaveBeenCalled();
    expect(prefs.remove).not.toHaveBeenCalled();
  });

  it('clears only the session on a recognized decode code', async () => {
    prefs.get.mockResolvedValue({ value: '1' });
    plugin.get.mockRejectedValue({ code: -26275, message: 'errSecDecode' });
    const { secureStorage } = await import('./secureStorage');
    await expect(secureStorage.getItem('sb-project-auth-token')).resolves.toBeNull();
    expect(plugin.remove).toHaveBeenCalledWith({ key: 'sb-project-auth-token' });
    expect(prefs.remove).toHaveBeenCalledWith({ key: 'sb-project-auth-token' });
    await expect(secureStorage.getItem('db_enc_key')).rejects.toEqual({ code: -26275, message: 'errSecDecode' });
    expect(plugin.remove).toHaveBeenCalledTimes(1);
  });

  it('purges retained Keychain session and DB key before the first read, once per install', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    const { prepareNativeInstall, secureStorage, FRESH_INSTALL_FLAG } = await import('./secureStorage');
    await Promise.all([prepareNativeInstall(), secureStorage.getItem('al_local_encryption_key')]);
    expect(plugin.remove.mock.calls).toEqual([
      [{ key: 'sb-project-auth-token' }], [{ key: 'al_local_encryption_key' }], [{ key: 'db_enc_key' }],
    ]);
    expect(prefs.remove.mock.calls).toEqual(plugin.remove.mock.calls);
    expect(prefs.set).toHaveBeenCalledWith({ key: FRESH_INSTALL_FLAG, value: '1' });
    expect(sqlite.clearEncryptionSecret).toHaveBeenCalledTimes(1);
    expect(plugin.remove.mock.invocationCallOrder.at(-1)).toBeLessThan(plugin.get.mock.invocationCallOrder[0]);
    await prepareNativeInstall();
    expect(plugin.remove).toHaveBeenCalledTimes(3);
  });

  it('does not purge an existing install', async () => {
    prefs.get.mockResolvedValue({ value: '1' });
    const { prepareNativeInstall } = await import('./secureStorage');
    await prepareNativeInstall();
    expect(plugin.remove).not.toHaveBeenCalled();
    expect(prefs.set).not.toHaveBeenCalled();
  });

  it('does not purge an unflagged install with an existing DB', async () => {
    sqlite.isDatabase.mockResolvedValue({ result: true });
    const { prepareNativeInstall, FRESH_INSTALL_FLAG } = await import('./secureStorage');
    await prepareNativeInstall();
    expect(sqlite.isDatabase).toHaveBeenCalledWith({ database: 'acreledger_db' });
    expect(plugin.remove).not.toHaveBeenCalled();
    expect(prefs.remove).not.toHaveBeenCalled();
    expect(sqlite.clearEncryptionSecret).not.toHaveBeenCalled();
    expect(prefs.set).toHaveBeenCalledWith({ key: FRESH_INSTALL_FLAG, value: '1' });
  });

  it.each(['db_enc_key', 'user-1_al_farm_id', 'al_local_encryption_key', 'sb-project-auth-token'])(
    'preserves unflagged container Preferences data: %s', async key => {
      prefs.keys.mockResolvedValue({ keys: [key] });
      const { prepareNativeInstall } = await import('./secureStorage');
      await prepareNativeInstall();
      expect(plugin.remove).not.toHaveBeenCalled();
      expect(sqlite.clearEncryptionSecret).not.toHaveBeenCalled();
      expect(prefs.set).toHaveBeenCalledTimes(1);
    });

  it('preserves an unflagged install with localStorage farm data', async () => {
    localStorage.setItem('user-1_al_farm_id', 'farm-1');
    try {
      const { prepareNativeInstall } = await import('./secureStorage');
      await prepareNativeInstall();
      expect(plugin.remove).not.toHaveBeenCalled();
      expect(sqlite.clearEncryptionSecret).not.toHaveBeenCalled();
      expect(prefs.set).toHaveBeenCalledTimes(1);
    } finally { localStorage.removeItem('user-1_al_farm_id'); }
  });

  it('does not purge when database detection fails', async () => {
    sqlite.isDatabase.mockRejectedValueOnce(new Error('database unavailable'));
    const { prepareNativeInstall } = await import('./secureStorage');
    await expect(prepareNativeInstall()).rejects.toThrow('database unavailable');
    expect(plugin.remove).not.toHaveBeenCalled();
    expect(prefs.set).not.toHaveBeenCalled();
    await prepareNativeInstall();
    expect(plugin.remove).toHaveBeenCalledTimes(3);
  });

  it('leaves the flag unset when purge fails and retries later', async () => {
    plugin.remove.mockRejectedValueOnce(new Error('locked'));
    const { prepareNativeInstall } = await import('./secureStorage');
    await expect(prepareNativeInstall()).rejects.toThrow('locked');
    expect(prefs.set).not.toHaveBeenCalled();
    await prepareNativeInstall();
    expect(prefs.set).toHaveBeenCalledTimes(1);
  });

  it('does nothing on web', async () => {
    platform = 'web';
    const { prepareNativeInstall } = await import('./secureStorage');
    await prepareNativeInstall();
    expect(prefs.get).not.toHaveBeenCalled();
    expect(plugin.remove).not.toHaveBeenCalled();
  });
});
