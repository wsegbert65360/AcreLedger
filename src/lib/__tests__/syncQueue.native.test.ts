import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
  run: vi.fn(), executeSet: vi.fn(), query: vi.fn(),
};
const nativeState = { database: db as typeof db | null };

vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.doMock('../offlineStorage', () => ({
  getDatabase: vi.fn(async () => nativeState.database),
  OFFLINE_DATABASE_UNAVAILABLE: 'Offline database unavailable.',
}));
vi.doMock('../supabase', () => ({ supabase: { from: vi.fn() } }));
vi.doMock('@/utils/crypto', () => ({
  encryptData: vi.fn(), decryptData: vi.fn(), getLocalEncryptionKey: vi.fn(),
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let syncQueue: (typeof import('../syncQueue'))['syncQueue'];
beforeAll(async () => ({ syncQueue } = await import('../syncQueue')));

describe('syncQueue native persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeState.database = db;
    db.run.mockResolvedValue({ changes: { changes: 1 } });
    db.executeSet.mockResolvedValue({ changes: { changes: 2 } });
  });

  it('rejects a single enqueue when the SQLite database is unavailable', async () => {
    nativeState.database = null;
    await expect(syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1'))
      .rejects.toThrow('Offline database unavailable');
  });

  it('persists a batch with one transactional executeSet call', async () => {
    await syncQueue.enqueueMutations([
      { tableName: 'fields', operation: 'soft_delete', payload: { id: 'f1' }, farmId: 'farm-1' },
      { tableName: 'field_clu_assignments', operation: 'soft_delete', payload: { id: 'a1' }, farmId: 'farm-1' },
    ]);

    expect(db.executeSet).toHaveBeenCalledTimes(1);
    expect(db.executeSet).toHaveBeenCalledWith([
      expect.objectContaining({ values: expect.arrayContaining(['fields', 'soft_delete', 'farm-1']) }),
      expect.objectContaining({ values: expect.arrayContaining(['field_clu_assignments', 'soft_delete', 'farm-1']) }),
    ], true);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('deletes only the selected farm queue during cleanup', async () => {
    await syncQueue.clearQueue('farm-1');
    expect(db.run).toHaveBeenCalledWith('DELETE FROM sync_queue WHERE farm_id = ?;', ['farm-1']);
  });

  it('does not report an empty queue when the SQLite database is unavailable', async () => {
    nativeState.database = null;
    await expect(syncQueue.getQueue('farm-1')).rejects.toThrow('Offline database unavailable');
    await expect(syncQueue.getPendingCount('farm-1')).rejects.toThrow('Offline database unavailable');
  });

  it('throws a native dequeue error instead of reporting it removed', async () => {
    db.run.mockRejectedValueOnce(new Error('locked'));
    await expect(syncQueue.dequeueMutation('q1')).rejects.toThrow('locked');
  });

  it('quarantines one corrupt native payload in place and preserves other queued rows', async () => {
    db.query.mockResolvedValue({ values: [
      { id: 'bad', table_name: 'fields', payload: '{broken', farm_id: 'farm-1', retry_count: 0 },
      { id: 'good', table_name: 'fields', payload: '{"id":"f1"}', farm_id: 'farm-1', retry_count: 0 },
    ] });
    const queue = await syncQueue.getQueue('farm-1');
    expect(queue[0]).toMatchObject({ id: 'bad', retry_count: 10, payload: { __corrupt_native_payload: '{broken' } });
    expect(queue[1].payload).toEqual({ id: 'f1' });
    expect(db.run).toHaveBeenCalledWith('UPDATE sync_queue SET retry_count = ? WHERE id = ?;', [10, 'bad']);
    expect(db.run.mock.calls.some(call => String(call[0]).includes('DELETE'))).toBe(false);
  });
});
