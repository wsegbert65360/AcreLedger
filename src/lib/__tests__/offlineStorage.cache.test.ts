import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/utils/crypto', () => ({
  getLocalEncryptionKey: vi.fn().mockResolvedValue('test-key'),
  encryptData: vi.fn(async (data: string) => `enc:v1:${data}`),
  decryptData: vi.fn(async (payload: string) => {
    if (payload.startsWith('enc:v1:')) return payload.slice('enc:v1:'.length);
    if (payload.startsWith('enc:')) throw new Error('Decryption failed');
    return payload;
  }),
}));

import { decryptData, getLocalEncryptionKey } from '@/utils/crypto';
import { offlineStorage } from '../offlineStorage';
import { SYNC_QUEUE_KEYS } from '../syncQueue';

describe('offline cache clear safety', () => {
  it('refuses a null user and preserves the queue and quarantine', async () => {
    localStorage.clear();
    for (const key of SYNC_QUEUE_KEYS) localStorage.setItem(key, 'preserved');
    localStorage.setItem('user-1_al_fields', 'cache');
    localStorage.setItem('user-2_al_fields', 'other user');
    await expect(offlineStorage.clearCache(null)).rejects.toThrow('user ID');
    await offlineStorage.clearCache('user-1');
    for (const key of SYNC_QUEUE_KEYS) expect(localStorage.getItem(key)).toBe('preserved');
    expect(localStorage.getItem('user-1_al_fields')).toBeNull();
    expect(localStorage.getItem('user-2_al_fields')).toBe('other user');
  });
});

describe('web loadCache decrypt misses', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getLocalEncryptionKey).mockReset();
    vi.mocked(getLocalEncryptionKey).mockResolvedValue('test-key');
    vi.mocked(decryptData).mockClear();
  });

  it('removes an undecryptable snapshot and leaves the queue and other caches', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bad = 'enc:stale:ciphertext';
      const fields = `enc:v1:${JSON.stringify([{ id: 'field-1' }])}`;
      localStorage.setItem('user-1_al_cattle_groups', bad);
      localStorage.setItem('user-1_al_fields', fields);
      localStorage.setItem('user-2_al_cattle_groups', bad);
      for (const queueKey of SYNC_QUEUE_KEYS) localStorage.setItem(queueKey, 'queued-work');

      await expect(offlineStorage.loadCache('cattle_groups', 'user-1')).resolves.toBeNull();

      expect(localStorage.getItem('user-1_al_cattle_groups')).toBeNull();
      expect(localStorage.getItem('user-1_al_fields')).toBe(fields);
      expect(localStorage.getItem('user-2_al_cattle_groups')).toBe(bad);
      for (const queueKey of SYNC_QUEUE_KEYS) {
        expect(localStorage.getItem(queueKey)).toBe('queued-work');
      }
      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledTimes(1);

      localStorage.setItem('user-1_al_cattle_groups', bad);
      await expect(offlineStorage.loadCache('cattle_groups', 'user-1')).resolves.toBeNull();
      expect(localStorage.getItem('user-1_al_cattle_groups')).toBeNull();
      expect(debugSpy).toHaveBeenCalledTimes(1);
      for (const queueKey of SYNC_QUEUE_KEYS) {
        expect(localStorage.getItem(queueKey)).toBe('queued-work');
      }
    } finally {
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('drops a snapshot that decrypts but is not JSON', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      localStorage.setItem('user-1_al_farm_settings', 'enc:v1:not-json{');
      for (const queueKey of SYNC_QUEUE_KEYS) localStorage.setItem(queueKey, 'queued-work');

      await expect(offlineStorage.loadCache('farm_settings', 'user-1')).resolves.toBeNull();

      expect(localStorage.getItem('user-1_al_farm_settings')).toBeNull();
      for (const queueKey of SYNC_QUEUE_KEYS) {
        expect(localStorage.getItem(queueKey)).toBe('queued-work');
      }
      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledTimes(1);
    } finally {
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('leaves the snapshot in place when the device key cannot be read', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const stored = `enc:v1:${JSON.stringify([{ id: 'event-1' }])}`;
      localStorage.setItem('user-1_al_cattle_events', stored);
      for (const queueKey of SYNC_QUEUE_KEYS) localStorage.setItem(queueKey, 'queued-work');
      vi.mocked(getLocalEncryptionKey).mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(offlineStorage.loadCache('cattle_events', 'user-1')).resolves.toBeNull();

      expect(localStorage.getItem('user-1_al_cattle_events')).toBe(stored);
      for (const queueKey of SYNC_QUEUE_KEYS) {
        expect(localStorage.getItem(queueKey)).toBe('queued-work');
      }
      expect(decryptData).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledTimes(1);
    } finally {
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('round-trips a valid encrypted snapshot', async () => {
    const snapshot = [{ id: 'move-1', head_count: 12 }];
    await offlineStorage.saveCache('cattle_moves', 'user-1', snapshot);
    await expect(offlineStorage.loadCache('cattle_moves', 'user-1')).resolves.toEqual(snapshot);
    expect(localStorage.getItem('user-1_al_cattle_moves')).toBe(`enc:v1:${JSON.stringify(snapshot)}`);
  });
});
