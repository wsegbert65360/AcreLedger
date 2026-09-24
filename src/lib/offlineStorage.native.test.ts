import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  const migrationConnection = { open: vi.fn() };
  const encryptedConnection = {
    execute: vi.fn(),
    isDBOpen: vi.fn(),
    open: vi.fn(),
  };
  const sqlite = {
    checkConnectionsConsistency: vi.fn(),
    closeConnection: vi.fn(),
    createConnection: vi.fn(),
    isConnection: vi.fn(),
    isDatabase: vi.fn(),
    isDatabaseEncrypted: vi.fn(),
    isSecretStored: vi.fn(),
    setEncryptionSecret: vi.fn(),
  };
  return { encryptedConnection, migrationConnection, sqlite };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    constructor() {
      return native.sqlite;
    }
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: { remove: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/utils/crypto', () => ({
  decryptData: vi.fn(),
  encryptData: vi.fn(),
  getLocalEncryptionKey: vi.fn().mockResolvedValue('device-secret'),
}));

describe('native offline database initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native.sqlite.checkConnectionsConsistency.mockResolvedValue({ result: true });
    native.sqlite.isConnection.mockResolvedValue({ result: false });
    native.sqlite.isDatabase.mockResolvedValue({ result: true });
    native.sqlite.isDatabaseEncrypted.mockResolvedValue({ result: false });
    native.sqlite.isSecretStored.mockResolvedValue({ result: true });
    native.migrationConnection.open.mockResolvedValue(undefined);
    native.encryptedConnection.isDBOpen.mockResolvedValue({ result: false });
    native.encryptedConnection.open.mockResolvedValue(undefined);
    native.encryptedConnection.execute.mockResolvedValue(undefined);
    native.sqlite.createConnection
      .mockResolvedValueOnce(native.migrationConnection)
      .mockResolvedValueOnce(native.encryptedConnection);
    native.sqlite.closeConnection.mockResolvedValue(undefined);
  });

  it('encrypts a legacy plaintext database before opening it with the stored secret', async () => {
    const { getDatabase } = await import('@/lib/offlineStorage');

    await expect(getDatabase()).resolves.toBe(native.encryptedConnection);

    expect(native.sqlite.createConnection).toHaveBeenNthCalledWith(
      1,
      'acreledger_db',
      true,
      'encryption',
      1,
      false
    );
    expect(native.migrationConnection.open).toHaveBeenCalledOnce();
    expect(native.sqlite.closeConnection).toHaveBeenCalledWith('acreledger_db', false);
    expect(native.sqlite.createConnection).toHaveBeenNthCalledWith(
      2,
      'acreledger_db',
      true,
      'secret',
      1,
      false
    );
    expect(native.encryptedConnection.isDBOpen).toHaveBeenCalledOnce();
    expect(native.encryptedConnection.open).toHaveBeenCalledOnce();
  });
});
