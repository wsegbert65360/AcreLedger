import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

import { offlineStorage } from '@/lib/offlineStorage';

const user = 'user-1';

describe('offlineStorage.bindCacheToFarm (web)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps an existing cache the first time it learns the farm', async () => {
    await offlineStorage.saveCache('fields', user, [{ id: 'f1' }]);
    expect(await offlineStorage.bindCacheToFarm(user, 'farm-a')).toBe(false);
    expect(await offlineStorage.loadCache('fields', user)).toEqual([{ id: 'f1' }]);
  });

  it('keeps the cache when the farm is unchanged', async () => {
    await offlineStorage.bindCacheToFarm(user, 'farm-a');
    await offlineStorage.saveCache('fields', user, [{ id: 'f1' }]);
    expect(await offlineStorage.bindCacheToFarm(user, 'farm-a')).toBe(false);
    expect(await offlineStorage.loadCache('fields', user)).toEqual([{ id: 'f1' }]);
  });

  it("drops the old farm's rows when the user's farm changes, and leaves the sync queue", async () => {
    await offlineStorage.bindCacheToFarm(user, 'farm-a');
    await offlineStorage.saveCache('fields', user, [{ id: 'f1' }]);
    localStorage.setItem('al_sync_queue', '[]');
    expect(await offlineStorage.bindCacheToFarm(user, 'farm-b')).toBe(true);
    expect(await offlineStorage.loadCache('fields', user)).toBeNull();
    expect(localStorage.getItem('al_sync_queue')).toBe('[]');
    expect(await offlineStorage.bindCacheToFarm(user, 'farm-b')).toBe(false);
  });

  it("does not touch another user's cache", async () => {
    await offlineStorage.bindCacheToFarm(user, 'farm-a');
    await offlineStorage.saveCache('fields', 'user-2', [{ id: 'other' }]);
    await offlineStorage.bindCacheToFarm(user, 'farm-b');
    expect(await offlineStorage.loadCache('fields', 'user-2')).toEqual([{ id: 'other' }]);
  });
});
