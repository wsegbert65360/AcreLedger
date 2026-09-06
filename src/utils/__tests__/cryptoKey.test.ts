import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@capacitor/preferences');
  vi.resetModules();
});

describe('local encryption key initialization', () => {
  it('shares one first-use initialization across concurrent callers', async () => {
    let storedKey: string | null = null;
    const get = vi.fn(async () => {
      await Promise.resolve();
      return { value: storedKey };
    });
    const set = vi.fn(async ({ value }: { value: string }) => {
      storedKey = value;
    });
    vi.doMock('@capacitor/preferences', () => ({ Preferences: { get, set } }));
    const { getLocalEncryptionKey } = await import('../crypto');

    const keys = await Promise.all(
      Array.from({ length: 16 }, () => getLocalEncryptionKey()),
    );

    expect(new Set(keys)).toHaveLength(1);
    expect(keys[0]).toBe(storedKey);
    expect(get).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('uses a browser lock to serialize key creation across tabs', async () => {
    const storedKey = 'persisted-key';
    const request = vi.fn(async (_name: string, callback: () => Promise<string>) => callback());
    const originalLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: {
        get: vi.fn().mockResolvedValue({ value: storedKey }),
        set: vi.fn(),
      },
    }));

    try {
      const { getLocalEncryptionKey } = await import('../crypto');
      await expect(getLocalEncryptionKey()).resolves.toBe(storedKey);
      expect(request).toHaveBeenCalledWith(
        'acreledger-local-encryption-key',
        expect.any(Function),
      );
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks });
    }
  });

  it('allows retry after a transient storage failure', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue({ value: 'recovered-key' });
    vi.doMock('@capacitor/preferences', () => ({
      Preferences: { get, set: vi.fn() },
    }));
    const { getLocalEncryptionKey } = await import('../crypto');

    await expect(getLocalEncryptionKey()).rejects.toThrow('storage unavailable');
    await expect(getLocalEncryptionKey()).resolves.toBe('recovered-key');
    expect(get).toHaveBeenCalledTimes(2);
  });
});
