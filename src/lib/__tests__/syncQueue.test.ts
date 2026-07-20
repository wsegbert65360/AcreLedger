import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Capacitor to force web path (localStorage)
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@/utils/crypto', () => ({
  getLocalEncryptionKey: vi.fn().mockResolvedValue('test-key'),
  encryptData: vi.fn().mockImplementation((data: string) => `enc:fake:${btoa(data)}`),
  decryptData: vi.fn().mockImplementation((encrypted: string) => {
    if (encrypted.startsWith('enc:fake:')) return atob(encrypted.slice(9));
    return encrypted;
  }),
}));

// Minimal Supabase mock — returns success for all operations
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
      update: () => ({
        eq: () => ({
          select: () => Promise.resolve({ data: [{ id: '1' }], error: null }),
        }),
      }),
    }),
  },
}));

import { syncQueue } from '../syncQueue';

describe('syncQueue web queue management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ─── Enqueue + Persistence ───────────────────────────────────────────────

  it('enqueues and persists a mutation', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1', name: 'Test' }, 'farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].table_name).toBe('fields');
    expect(queue[0].operation).toBe('insert');
    expect(queue[0].payload).toEqual({ id: 'f1', name: 'Test' });
    expect(queue[0].farm_id).toBe('farm-1');
    expect(queue[0].retry_count).toBe(0);
    expect(queue[0].id).toBeDefined();
  });

  it('enqueues multiple mutations for different farms', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f2' }, 'farm-2');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'b1' }, 'farm-1');

    const farm1 = await syncQueue.getQueue('farm-1');
    const farm2 = await syncQueue.getQueue('farm-2');

    expect(farm1).toHaveLength(2);
    expect(farm2).toHaveLength(1);
  });

  it('enqueues all three operation types', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Updated' }, 'farm-1');
    await syncQueue.enqueueMutation('plant_records', 'soft_delete', { id: 'p1', deleted_at: '2026-01-01' }, 'farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(3);
    expect(queue[0].operation).toBe('insert');
    expect(queue[1].operation).toBe('update');
    expect(queue[2].operation).toBe('soft_delete');
  });

  // ─── Dequeue ──────────────────────────────────────────────────────────────

  it('dequeues a specific mutation', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'b1' }, 'farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    const idToRemove = queue[0].id;
    await syncQueue.dequeueMutation(idToRemove);

    const remaining = await syncQueue.getQueue('farm-1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].table_name).toBe('bins');
  });

  it('ignores dequeue for nonexistent id', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');

    await syncQueue.dequeueMutation('nonexistent-id');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
  });

  // ─── Pending Count ───────────────────────────────────────────────────────

  it('reports zero pending count for empty queue', async () => {
    expect(await syncQueue.getPendingCount('farm-1')).toBe(0);
  });

  it('reports correct pending count per farm', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'b1' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f2' }, 'farm-2');

    expect(await syncQueue.getPendingCount('farm-1')).toBe(2);
    expect(await syncQueue.getPendingCount('farm-2')).toBe(1);
  });

  // ─── Replay — Empty Queue ──────────────────────────────────────────────────

  it('returns true for empty queue', async () => {
    const result = await syncQueue.replayQueue('farm-1');
    expect(result).toBe(true);
  });

  // ─── Replay — Valid Table ──────────────────────────────────────────────────

  it('replays insert mutation successfully', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1', name: 'Test' }, 'farm-1');

    const result = await syncQueue.replayQueue('farm-1');
    expect(result).toBe(true);

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toEqual([]);
  });

  it('replays multiple mutations successfully', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1', name: 'A' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'b1', name: 'B' }, 'farm-1');
    await syncQueue.enqueueMutation('plant_records', 'insert', { id: 'p1' }, 'farm-1');

    const result = await syncQueue.replayQueue('farm-1');
    expect(result).toBe(true);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  // ─── Replay — Invalid Table ───────────────────────────────────────────────

  it('discards mutations for invalid table names', async () => {
    await syncQueue.enqueueMutation('nonexistent_table', 'insert', { id: 'x' }, 'farm-1');

    const result = await syncQueue.replayQueue('farm-1');
    expect(result).toBe(true);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  // ─── Replay — Farm Isolation ─────────────────────────────────────────────

  it('only replays mutations for the specified farm', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f2' }, 'farm-2');

    const result = await syncQueue.replayQueue('farm-1');
    expect(result).toBe(true);

    // farm-2 mutations should still be queued
    expect(await syncQueue.getPendingCount('farm-2')).toBe(1);
  });

  // ─── Retry Count ──────────────────────────────────────────────────────────

  it('starts with retry_count of 0', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue[0].retry_count).toBe(0);
  });

  // ─── Allowed Tables ───────────────────────────────────────────────────────

  it('accepts all standard tables', async () => {
    const tables = [
      'fields', 'bins', 'plant_records', 'spray_records',
      'harvest_records', 'hay_harvest_records', 'custom_spray_records', 'fertilizer_applications',
      'tillage_records', 'grain_movements', 'saved_seeds',
      'fertilizer_recipes', 'spray_recipes',
    ];

    for (const table of tables) {
      await syncQueue.enqueueMutation(table, 'insert', { id: `x-${table}` }, 'farm-1');
    }

    expect(await syncQueue.getPendingCount('farm-1')).toBe(tables.length);
  });

  // ─── Mutation ID Uniqueness ───────────────────────────────────────────────

  it('assigns unique IDs to each mutation', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f2' }, 'farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue[0].id).not.toBe(queue[1].id);
  });

  // ─── Persistence Failure Propagation ─────────────────────────────────────
  // enqueueMutation must reject when persistence fails so hooks can roll back
  // optimistic state. (Previously it swallowed the error, leaving hook
  // rollback branches as unreachable dead code.)

  it('enqueueMutation rejects when localStorage persistence fails', async () => {
    const original = localStorage.setItem;
    // Simulate a quota / storage failure.
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });

    await expect(
      syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1')
    ).rejects.toThrow('QuotaExceededError');

    // Queue must remain empty — the failed enqueue wrote nothing durable.
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);

    localStorage.setItem = original;
  });

  // ─── Atomic Batch (enqueueMutations) ─────────────────────────────────────

  it('enqueueMutations writes all rows on success', async () => {
    await syncQueue.enqueueMutations([
      { tableName: 'grain_movements', operation: 'soft_delete', payload: { id: 'g1', deleted_at: 't' }, farmId: 'farm-1' },
      { tableName: 'grain_movements', operation: 'soft_delete', payload: { id: 'g2', deleted_at: 't' }, farmId: 'farm-1' },
      { tableName: 'grain_movements', operation: 'soft_delete', payload: { id: 'g3', deleted_at: 't' }, farmId: 'farm-1' },
    ]);

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(3);
    expect(queue.map(q => q.payload.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('enqueueMutations is atomic — rejects on persistence failure and writes nothing', async () => {
    const original = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });

    await expect(
      syncQueue.enqueueMutations([
        { tableName: 'grain_movements', operation: 'soft_delete', payload: { id: 'g1' }, farmId: 'farm-1' },
        { tableName: 'grain_movements', operation: 'soft_delete', payload: { id: 'g2' }, farmId: 'farm-1' },
      ])
    ).rejects.toThrow('QuotaExceededError');

    // On the web path the batch is a single saveWebQueue, so a failure means
    // none of the rows were persisted.
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);

    localStorage.setItem = original;
  });

  it('enqueueMutations is a no-op for an empty batch', async () => {
    await syncQueue.enqueueMutations([]);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('clearQueue removes only the selected farm queue', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f2' }, 'farm-2');

    await syncQueue.clearQueue('farm-1');

    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
    expect(await syncQueue.getPendingCount('farm-2')).toBe(1);
  });
});
