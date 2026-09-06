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

const supabaseControl = vi.hoisted(() => ({
  insertResponses: [] as Array<{ data?: unknown; error: any; status?: number }>,
  selectResponses: [] as Array<{ data: unknown; error: any; status?: number }>,
  updateResponses: [] as Array<{ error: any; count: number | null; status?: number }>,
  rpcResponses: [] as Array<{ data: any; error: any; status?: number }>,
  insert: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
}));

function updateBuilder(...args: unknown[]) {
  supabaseControl.update(...args);
  const response = Promise.resolve(
    supabaseControl.updateResponses.shift() ?? { error: null, count: 1, status: 204 },
  );
  const builder: any = {
    eq: () => builder,
    then: response.then.bind(response),
  };
  return builder;
}

function selectBuilder() {
  const builder: any = {
    eq: () => builder,
    maybeSingle: () => Promise.resolve(
      supabaseControl.selectResponses.shift() ?? { data: null, error: null, status: 200 },
    ),
  };
  return builder;
}

// Configurable Supabase mock; defaults to successful operations.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        supabaseControl.insert(...args);
        return Promise.resolve(
          supabaseControl.insertResponses.shift() ?? { error: null, status: 201 },
        );
      },
      upsert: () => Promise.resolve({ error: null, status: 201 }),
      update: updateBuilder,
      select: selectBuilder,
    }),
    rpc: (...args: unknown[]) => {
      supabaseControl.rpc(...args);
      return Promise.resolve(
        supabaseControl.rpcResponses.shift() ?? { data: null, error: null, status: 200 },
      );
    },
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }),
}));

import { syncQueue } from '../syncQueue';

describe('syncQueue web queue management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseControl.insertResponses.length = 0;
    supabaseControl.selectResponses.length = 0;
    supabaseControl.updateResponses.length = 0;
    supabaseControl.rpcResponses.length = 0;
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

  it('replays a linked harvest and grain movement through one atomic RPC', async () => {
    await syncQueue.enqueueMutation('harvest_records', 'insert', {
      id: 'h1',
      field_id: 'field-1',
      __linked_grain_movement: {
        id: 'g1',
        bin_id: 'bin-1',
        harvest_record_id: 'h1',
        version: 1,
      },
    }, 'farm-1');

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    expect(supabaseControl.rpc).toHaveBeenCalledWith('create_harvest_with_grain', {
      p_farm_id: 'farm-1',
      p_idempotency_key: 'h1',
      p_harvest: { id: 'h1', field_id: 'field-1', farm_id: 'farm-1' },
      p_grain_movement: expect.objectContaining({
        id: 'g1',
        harvest_record_id: 'h1',
        farm_id: 'farm-1',
      }),
    });
    expect(supabaseControl.insert).not.toHaveBeenCalled();
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('atomically replays legacy two-row harvest queues', async () => {
    await syncQueue.enqueueMutations([
      { tableName: 'harvest_records', operation: 'insert', payload: { id: 'h1' }, farmId: 'farm-1' },
      { tableName: 'grain_movements', operation: 'insert', payload: { id: 'g1', harvest_record_id: 'h1' }, farmId: 'farm-1' },
    ]);

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    expect(supabaseControl.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseControl.insert).not.toHaveBeenCalled();
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('retains both legacy linked rows when their atomic RPC fails', async () => {
    await syncQueue.enqueueMutations([
      { tableName: 'harvest_records', operation: 'insert', payload: { id: 'h1' }, farmId: 'farm-1' },
      { tableName: 'grain_movements', operation: 'insert', payload: { id: 'g1', harvest_record_id: 'h1' }, farmId: 'farm-1' },
    ]);
    supabaseControl.rpcResponses.push({
      data: null,
      error: { code: '23514', message: 'invalid linked payload' },
      status: 409,
    });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(2);
    expect(queue.every(item => item.retry_count === 1)).toBe(true);
    expect(supabaseControl.insert).not.toHaveBeenCalled();
  });

  it('continues past a permanent PostgREST error without discarding the failed mutation', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'bad' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'good' }, 'farm-1');
    supabaseControl.insertResponses.push(
      { error: { code: '23514', message: 'check constraint failed' }, status: 409 },
      { error: null, status: 201 },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].payload.id).toBe('bad');
    expect(queue[0].retry_count).toBe(1);
    expect(supabaseControl.insert).toHaveBeenCalledTimes(2);
  });

  it('retains a permanent failure after three attempts for later recovery', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'bad' }, 'farm-1');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      supabaseControl.insertResponses.push({
        error: { code: '42501', message: 'permission denied' },
        status: 403,
      });
      await syncQueue.replayQueue('farm-1');
    }

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(3);
  });

  it('reconciles a retried insert whose stable ID and payload already exist', async () => {
    const payload = { id: 'committed', name: 'Already saved', metadata: { source: 'offline' } };
    await syncQueue.enqueueMutation('fields', 'insert', payload, 'farm-1');
    supabaseControl.insertResponses.push({
      error: { code: '23505', message: 'duplicate key' },
      status: 409,
    });
    supabaseControl.selectResponses.push({
      data: { ...payload, farm_id: 'farm-1', server_default: true },
      error: null,
      status: 200,
    });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('does not reconcile a duplicate stable ID when the stored payload differs', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'collision', name: 'Offline value' }, 'farm-1');
    supabaseControl.insertResponses.push({
      error: { code: '23505', message: 'duplicate key' },
      status: 409,
    });
    supabaseControl.selectResponses.push({
      data: { id: 'collision', name: 'Different value', farm_id: 'farm-1' },
      error: null,
      status: 200,
    });

    await syncQueue.replayQueue('farm-1');
    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(1);
  });

  it('pauses on a real transient response and leaves later work untouched', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'offline' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'later' }, 'farm-1');
    supabaseControl.insertResponses.push({
      error: { code: '08006', message: 'connection failure' },
      status: 503,
    });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(2);
    expect(queue.every(item => item.retry_count === 0)).toBe(true);
    expect(supabaseControl.insert).toHaveBeenCalledTimes(1);
  });

  it('requests exact counts for replayed updates and soft deletes', async () => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Changed' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'soft_delete', { id: 'b1', deleted_at: '2026-09-05T00:00:00.000Z' }, 'farm-1');

    await syncQueue.replayQueue('farm-1');

    expect(supabaseControl.update).toHaveBeenNthCalledWith(1, { name: 'Changed' }, { count: 'exact' });
    expect(supabaseControl.update).toHaveBeenNthCalledWith(
      2,
      { deleted_at: '2026-09-05T00:00:00.000Z' },
      { count: 'exact' },
    );
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('removes a zero-row update only when the own-farm row already has the queued values', async () => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Changed' }, 'farm-1');
    supabaseControl.updateResponses.push({ error: null, count: 0, status: 204 });
    supabaseControl.rpcResponses.push({
      data: { id: 'f1', farm_id: 'farm-1', name: 'Changed', deleted_at: null },
      error: null,
      status: 200,
    });

    await syncQueue.replayQueue('farm-1');

    expect(supabaseControl.rpc).toHaveBeenCalledWith('get_offline_sync_row_state', {
      p_table_name: 'fields',
      p_row_id: 'f1',
      p_farm_id: 'farm-1',
    });
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('removes a zero-row soft delete only when the row is already deleted at the queued timestamp', async () => {
    const deletedAt = '2026-09-05T00:00:00.000Z';
    await syncQueue.enqueueMutation('fields', 'soft_delete', { id: 'f1', deleted_at: deletedAt }, 'farm-1');
    supabaseControl.updateResponses.push({ error: null, count: 0, status: 204 });
    supabaseControl.rpcResponses.push({
      data: { id: 'f1', farm_id: 'farm-1', deleted_at: '2026-09-05T00:00:00+00:00' },
      error: null,
      status: 200,
    });

    await syncQueue.replayQueue('farm-1');

    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('retains a zero-row conflict or missing target for recovery', async () => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Queued' }, 'farm-1');
    supabaseControl.updateResponses.push({ error: null, count: 0, status: 204 });
    supabaseControl.rpcResponses.push({
      data: { id: 'f1', farm_id: 'farm-1', name: 'Newer cloud value' },
      error: null,
      status: 200,
    });

    await syncQueue.replayQueue('farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(1);
  });

  it('replays grain updates against the queued expected version', async () => {
    await syncQueue.enqueueMutation('grain_movements', 'update', {
      id: 'g1',
      bushels: 900,
      version: 2,
      __expected_version: 1,
    }, 'farm-1');

    await syncQueue.replayQueue('farm-1');

    expect(supabaseControl.update).toHaveBeenCalledWith(
      { bushels: 900 },
      { count: 'exact' },
    );
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('requires the incremented version when reconciling a zero-row grain update', async () => {
    await syncQueue.enqueueMutation('grain_movements', 'update', {
      id: 'g1',
      bushels: 900,
      version: 2,
      __expected_version: 1,
    }, 'farm-1');
    supabaseControl.updateResponses.push({ error: null, count: 0, status: 204 });
    supabaseControl.rpcResponses.push({
      data: { id: 'g1', farm_id: 'farm-1', bushels: 900, version: 1 },
      error: null,
      status: 200,
    });

    await syncQueue.replayQueue('farm-1');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(1);
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

  it('drains a trailing replay requested while a replay is in flight', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'b1' }, 'farm-2');

    // Do not await: the first replay is still draining when the second call
    // arrives (the reconnect/farm-switch overlap that used to double-apply).
    const first = syncQueue.replayQueue('farm-1');
    const second = syncQueue.replayQueue('farm-2');
    const secondResult = await second;
    expect(secondResult).toBe(true);
    // Concurrent callers must not resolve until the owner (including the
    // trailing farm) has finished — otherwise farmStore fetchData() races.
    expect(await syncQueue.getPendingCount('farm-1')).toBe(0);
    expect(await syncQueue.getPendingCount('farm-2')).toBe(0);
    await expect(first).resolves.toBe(true);
  });

  // ─── Corruption Quarantine ─────────────────────────────────────────────────

  it('quarantines an unreadable queue blob instead of silently wiping it', async () => {
    localStorage.setItem('al_sync_queue', 'not-valid-queue-json');

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toEqual([]);
    expect(localStorage.getItem('al_sync_queue_corrupt')).toBe('not-valid-queue-json');

    // The next enqueue starts a fresh queue without touching the quarantine copy.
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    expect(await syncQueue.getPendingCount('farm-1')).toBe(1);
    expect(localStorage.getItem('al_sync_queue_corrupt')).toBe('not-valid-queue-json');
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
