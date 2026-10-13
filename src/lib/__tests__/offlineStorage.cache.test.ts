import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
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
