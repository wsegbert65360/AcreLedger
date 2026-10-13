/** @vitest-environment jsdom */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signOut: vi.fn(),
  stopAutoRefresh: vi.fn(),
  admin: { signOut: vi.fn() },
};
const remove = vi.fn();
let native = false;
vi.doMock('@/lib/supabase', () => ({ supabase: { auth } }));
vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native } }));
vi.doMock('@/lib/secureStorage', () => ({ secureStorage: { removeItem: remove } }));
let endAuthSession: (typeof import('./authSignOut'))['endAuthSession'];
let retryPendingSignOuts: (typeof import('./authSignOut'))['retryPendingSignOuts'];
let authStorageKey: (typeof import('./authStorage'))['authStorageKey'];
beforeAll(async () => {
  ({ endAuthSession, retryPendingSignOuts } = await import('./authSignOut'));
  ({ authStorageKey } = await import('./authStorage'));
});
beforeEach(async () => {
  auth.admin.signOut.mockResolvedValue({ error: null });
  await retryPendingSignOuts();
  vi.clearAllMocks();
  native = false;
  localStorage.clear();
  auth.signOut.mockResolvedValue({ error: null });
  remove.mockResolvedValue(undefined);
});

describe('sign-out safety and scope', () => {
  it('uses this-device scope by default and global only when requested', async () => {
    await endAuthSession(null);
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    await endAuthSession(null, 'global');
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'global' });
  });

  it('removes the persisted web session on a network error and retries the old token without restoring it', async () => {
    const key = authStorageKey();
    localStorage.setItem(key, 'persisted');
    localStorage.setItem(key + '-code-verifier', 'verifier');
    auth.signOut.mockResolvedValue({ error: { message: 'network' } });
    auth.admin.signOut.mockResolvedValue({ error: { status: 503 } });
    const session = { access_token: 'old-access-token' } as import('@supabase/supabase-js').Session;
    expect(await endAuthSession(session)).toEqual({ signedOut: true, serverPending: true });
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(key + '-code-verifier')).toBeNull();
    expect(auth.admin.signOut).toHaveBeenCalledWith('old-access-token', 'local');
    auth.admin.signOut.mockResolvedValue({ error: null });
    await retryPendingSignOuts();
    expect(auth.admin.signOut).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(key)).toBeNull();
    await retryPendingSignOuts();
    expect(auth.admin.signOut).toHaveBeenCalledTimes(2);
  });

  it('clears native credentials through the secure-storage adapter', async () => {
    native = true;
    auth.signOut.mockRejectedValue(new Error('timeout'));
    expect(await endAuthSession(null)).toEqual({ signedOut: true, serverPending: true });
    expect(remove).toHaveBeenCalledWith(authStorageKey());
  });

  it('still reports local sign-out if only ancillary cleanup fails', async () => {
    native = true;
    auth.signOut.mockResolvedValue({ error: { message: 'offline' } });
    remove.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('verifier locked'));
    await expect(endAuthSession(null)).resolves.toEqual({ signedOut: true, serverPending: true });
  });

  it('reports failure if local credential removal fails', async () => {
    native = true;
    auth.signOut.mockResolvedValue({ error: { message: 'offline' } });
    remove.mockRejectedValue(new Error('keychain locked'));
    await expect(endAuthSession(null)).rejects.toThrow('keychain locked');
  });
});
