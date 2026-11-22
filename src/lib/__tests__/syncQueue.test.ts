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
  refreshSession: vi.fn(),
}));

function updateBuilder(...args: unknown[]) {
  supabaseControl.update(...args);
  const response = Promise.resolve(
    supabaseControl.updateResponses.shift() ?? { error: null, count: 1, status: 204 },
  );
  const builder: any = {
    eq: () => builder,
    lte: () => builder,
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
    auth: {
      refreshSession: (...args: unknown[]) => supabaseControl.refreshSession(...args),
    },
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
    info: vi.fn(),
  }),
}));

import { CATTLE_RPCS, MAX_SYNC_RETRIES, cattleEnvelopeGroupIds, syncQueue, WebSyncQueueUnreadableError } from '../syncQueue';
import { toast } from 'sonner';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';

describe('syncQueue web queue management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseControl.insertResponses.length = 0;
    supabaseControl.selectResponses.length = 0;
    supabaseControl.updateResponses.length = 0;
    supabaseControl.rpcResponses.length = 0;
    localStorage.clear();
  });

  it('defers an online write behind pending and parked changes for the same farm/table/id', async () => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Older' }, 'farm-1');
    const [older] = await syncQueue.getQueue('farm-1');
    await syncQueue.parkMutation(older.id);
    expect(await syncQueue.shouldQueueWrite(true, 'farm-1', [{ tableName: 'fields', id: 'f1' }])).toBe(true);
    expect(await syncQueue.shouldQueueWrite(true, 'farm-2', [{ tableName: 'fields', id: 'f1' }])).toBe(false);
    expect(await syncQueue.shouldQueueWrite(true, 'farm-1', [{ tableName: 'bins', id: 'f1' }])).toBe(false);
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Newer' }, 'farm-1');
    expect(await syncQueue.replayQueue('farm-1')).toBe(false);
    expect(supabaseControl.update).not.toHaveBeenCalled();
    await syncQueue.retryFailed('farm-1');
    expect(await syncQueue.replayQueue('farm-1')).toBe(true);
    expect(supabaseControl.update.mock.calls.map(call => call[0])).toEqual([{ name: 'Older' }, { name: 'Newer' }]);
  });

  it('keeps younger edits behind a failed edit while allowing unrelated records to drain', async () => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Older' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Newer' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f2', name: 'Unrelated' }, 'farm-1');
    supabaseControl.updateResponses.push({ error: { code: '23514' }, count: null });
    expect(await syncQueue.replayQueue('farm-1')).toBe(false);
    expect(supabaseControl.update.mock.calls.map(call => call[0])).toEqual([{ name: 'Older' }, { name: 'Unrelated' }]);
    expect((await syncQueue.getQueue('farm-1')).map(item => item.retry_count)).toEqual([1, 0]);
  });

  it.each(['PGRST204', '42703', '42501'])('pauses %s, then parks it so it can be exported or discarded', async code => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Local' }, 'farm-1');
    for (let i = 0; i < MAX_SYNC_RETRIES; i++) {
      supabaseControl.updateResponses.push({ error: { code }, count: null });
      expect(await syncQueue.replayQueue('farm-1')).toBe(false);
    }
    expect((await syncQueue.getQueue('farm-1'))[0].retry_count).toBe(MAX_SYNC_RETRIES);
    expect(await syncQueue.getFailed('farm-1')).toHaveLength(1);
    // Once a fix is available, Retry resets the count and the change syncs.
    await syncQueue.retryFailed('farm-1');
    expect(await syncQueue.replayQueue('farm-1')).toBe(true);
    expect(await syncQueue.getQueue('farm-1')).toHaveLength(0);
  });

  it('throws on failed dequeue and halts the drain before a younger edit', async () => {
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Older' }, 'farm-1');
    await syncQueue.enqueueMutation('fields', 'update', { id: 'f1', name: 'Newer' }, 'farm-1');
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    try {
      expect(await syncQueue.replayQueue('farm-1')).toBe(false);
      expect(supabaseControl.update).toHaveBeenCalledTimes(1);
      expect(await syncQueue.getQueue('farm-1')).toHaveLength(2);
      await expect(syncQueue.discardFailed('farm-1')).resolves.toBe(0);
    } finally { setItem.mockRestore(); }
  });

  it('holds the cross-tab queue lock throughout replay without requesting it recursively', async () => {
    const locks = { request: vi.fn(async (_name: string, body: () => Promise<unknown>) => body()) };
    const previous = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
      locks.request.mockClear();
      expect(await syncQueue.replayQueue('farm-1')).toBe(true);
      expect(locks.request).toHaveBeenCalledTimes(1);
      expect(locks.request).toHaveBeenCalledWith('acreledger-sync-queue', expect.any(Function));
    } finally {
      if (previous) Object.defineProperty(navigator, 'locks', previous);
      else Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('serializes two tab contexts so replay cannot erase another tab enqueue', async () => {
    let tail: Promise<unknown> = Promise.resolve();
    const locks = { request: vi.fn((_name: string, body: () => Promise<unknown>) => {
      const next = tail.then(body);
      tail = next.catch(() => {});
      return next;
    }) };
    const previous = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      // Separate module instances model per-tab chains and in-flight drains;
      // the Web Lock and storage remain shared across both contexts.
      vi.resetModules();
      const tabA = (await import('../syncQueue')).syncQueue;
      vi.resetModules();
      const tabB = (await import('../syncQueue')).syncQueue;
      await Promise.all([
        tabA.enqueueMutation('fields', 'insert', { id: 'a' }, 'farm-1'),
        tabB.enqueueMutation('fields', 'insert', { id: 'b' }, 'farm-1'),
      ]);
      expect(await tabA.getQueue('farm-1')).toHaveLength(2);
      await Promise.all([
        tabA.replayQueue('farm-1'),
        tabB.enqueueMutation('fields', 'insert', { id: 'c' }, 'farm-1'),
      ]);
      expect((await tabB.getQueue('farm-1')).map(item => item.payload.id)).toEqual(['c']);
    } finally {
      if (previous) Object.defineProperty(navigator, 'locks', previous);
      else Reflect.deleteProperty(navigator, 'locks');
    }
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

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(2);
    expect(queue.every(item => item.retry_count === 1)).toBe(true);
    expect(supabaseControl.insert).not.toHaveBeenCalled();
  });

  it('removes a linked harvest pair the RPC reports as already applied', async () => {
    await syncQueue.enqueueMutations([
      { tableName: 'harvest_records', operation: 'insert', payload: { id: 'h1' }, farmId: 'farm-1' },
      { tableName: 'grain_movements', operation: 'insert', payload: { id: 'g1', harvest_record_id: 'h1' }, farmId: 'farm-1' },
    ]);
    supabaseControl.rpcResponses.push({
      data: { harvest_id: 'h1', grain_movement_id: 'g1', already_applied: true },
      error: null,
      status: 200,
    });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    expect(supabaseControl.rpc).toHaveBeenCalledTimes(1);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('reconciles a linked harvest retry by identity after the pair was edited and deleted', async () => {
    await syncQueue.enqueueMutation('harvest_records', 'insert', {
      id: 'h1',
      bushels: 1200,
      __linked_grain_movement: { id: 'g1', harvest_record_id: 'h1', bushels: 1200, version: 1 },
    }, 'farm-1');
    supabaseControl.rpcResponses.push(
      { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 },
      {
        data: { id: 'h1', farm_id: 'farm-1', bushels: 900, deleted_at: '2026-10-10T00:00:00+00:00' },
        error: null,
        status: 200,
      },
      {
        data: {
          id: 'g1', farm_id: 'farm-1', harvest_record_id: 'h1', bushels: 900,
          version: 3, deleted_at: '2026-10-10T00:00:00+00:00',
        },
        error: null,
        status: 200,
      },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    expect(supabaseControl.rpc).toHaveBeenCalledWith('get_offline_sync_row_state', {
      p_table_name: 'harvest_records',
      p_row_id: 'h1',
      p_farm_id: 'farm-1',
    });
    expect(supabaseControl.rpc).toHaveBeenCalledWith('get_offline_sync_row_state', {
      p_table_name: 'grain_movements',
      p_row_id: 'g1',
      p_farm_id: 'farm-1',
    });
    expect(supabaseControl.insert).not.toHaveBeenCalled();
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('removes both legacy linked rows when the duplicate pair is verified', async () => {
    await syncQueue.enqueueMutations([
      { tableName: 'harvest_records', operation: 'insert', payload: { id: 'h1' }, farmId: 'farm-1' },
      { tableName: 'grain_movements', operation: 'insert', payload: { id: 'g1', harvest_record_id: 'h1' }, farmId: 'farm-1' },
    ]);
    supabaseControl.rpcResponses.push(
      { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 },
      { data: { id: 'h1', farm_id: 'farm-1' }, error: null, status: 200 },
      { data: { id: 'g1', farm_id: 'farm-1', harvest_record_id: 'h1' }, error: null, status: 200 },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it.each([
    ['the harvest is missing', null, { id: 'g1', farm_id: 'farm-1', harvest_record_id: 'h1' }],
    ['the grain movement is missing', { id: 'h1', farm_id: 'farm-1' }, null],
    ['the grain links to another harvest', { id: 'h1', farm_id: 'farm-1' }, { id: 'g1', farm_id: 'farm-1', harvest_record_id: 'h2' }],
    ['the harvest belongs to another farm', { id: 'h1', farm_id: 'farm-2' }, { id: 'g1', farm_id: 'farm-1', harvest_record_id: 'h1' }],
    ['the grain belongs to another farm', { id: 'h1', farm_id: 'farm-1' }, { id: 'g1', farm_id: 'farm-2', harvest_record_id: 'h1' }],
    ['the grain ID differs', { id: 'h1', farm_id: 'farm-1' }, { id: 'g9', farm_id: 'farm-1', harvest_record_id: 'h1' }],
  ])('retains a duplicate linked harvest when %s', async (_case, harvestRow, grainRow) => {
    await syncQueue.enqueueMutation('harvest_records', 'insert', {
      id: 'h1',
      __linked_grain_movement: { id: 'g1', harvest_record_id: 'h1' },
    }, 'farm-1');
    supabaseControl.rpcResponses.push(
      { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 },
      { data: harvestRow, error: null, status: 200 },
      { data: grainRow, error: null, status: 200 },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);

    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(1);
  });

  it('does not reconcile a linked harvest whose queued grain links elsewhere', async () => {
    await syncQueue.enqueueMutation('harvest_records', 'insert', {
      id: 'h1',
      __linked_grain_movement: { id: 'g1', harvest_record_id: 'h2' },
    }, 'farm-1');
    supabaseControl.rpcResponses.push(
      { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);

    expect(supabaseControl.rpc).toHaveBeenCalledTimes(1);
    expect(await syncQueue.getQueue('farm-1')).toHaveLength(1);
  });

  it('does not reconcile a linked harvest on a non-duplicate RPC failure', async () => {
    await syncQueue.enqueueMutation('harvest_records', 'insert', {
      id: 'h1',
      __linked_grain_movement: { id: 'g1', harvest_record_id: 'h1' },
    }, 'farm-1');
    supabaseControl.rpcResponses.push(
      { data: null, error: { code: '23503', message: 'grain without harvest' }, status: 409 },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);

    expect(supabaseControl.rpc).toHaveBeenCalledTimes(1);
    expect(await syncQueue.getQueue('farm-1')).toHaveLength(1);
  });

  it('continues past a permanent PostgREST error without discarding the failed mutation', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'bad' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'good' }, 'farm-1');
    supabaseControl.insertResponses.push(
      { error: { code: '23514', message: 'check constraint failed' }, status: 409 },
      { error: null, status: 201 },
    );

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);

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
        error: { code: '23514', message: 'permission denied' },
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

  it('refreshes an expired session and retries without burning retry counts', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'offline-all-day' }, 'farm-1');
    supabaseControl.insertResponses.push(
      { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 },
      { error: null, status: 201 },
    );
    supabaseControl.refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);

    expect(supabaseControl.refreshSession).toHaveBeenCalledTimes(1);
    expect(supabaseControl.insert).toHaveBeenCalledTimes(2);
    expect(await syncQueue.getQueue('farm-1')).toHaveLength(0);
  });

  it('pauses without incrementing retries when the session cannot be refreshed', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'a' }, 'farm-1');
    await syncQueue.enqueueMutation('bins', 'insert', { id: 'b' }, 'farm-1');
    supabaseControl.insertResponses.push({
      error: { code: 'PGRST301', message: 'JWT expired' },
      status: 401,
    });
    supabaseControl.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh token revoked' } });

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

  it('quarantines an unreadable queue and blocks false replay success', async () => {
    const malformedQueue = `enc:fake:${btoa(JSON.stringify({ mutation: 'not-an-array' }))}`;
    localStorage.setItem('al_sync_queue', malformedQueue);

    await expect(syncQueue.getQueue('farm-1')).rejects.toBeInstanceOf(WebSyncQueueUnreadableError);
    expect(localStorage.getItem('al_sync_queue_corrupt')).toBe(malformedQueue);
    expect(toast.error).toHaveBeenCalledWith(
      'Offline changes could not be read.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Retry recovery' }) }),
    );

    await expect(syncQueue.replayQueue('farm-1')).rejects.toBeInstanceOf(WebSyncQueueUnreadableError);
    await expect(syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1'))
      .rejects.toBeInstanceOf(WebSyncQueueUnreadableError);
    expect(localStorage.getItem('al_sync_queue_corrupt')).toBe(malformedQueue);
    expect(localStorage.getItem('al_sync_queue')).toBe(malformedQueue);
  });

  it('restores a preserved queue through the recovery action', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'f1' }, 'farm-1');
    const encryptedQueue = localStorage.getItem('al_sync_queue');
    expect(encryptedQueue).not.toBeNull();
    localStorage.setItem('al_sync_queue_corrupt', encryptedQueue!);
    localStorage.setItem('al_sync_queue', 'broken-current-copy');

    await expect(syncQueue.recoverCorruptQueue()).resolves.toBe(true);
    expect(await syncQueue.getPendingCount('farm-1')).toBe(1);
    expect(localStorage.getItem('al_sync_queue_corrupt')).toBe(encryptedQueue);
    expect(toast.success).toHaveBeenCalledWith('Offline changes recovered. They are ready to sync.');
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
      'equipment', 'maintenance_schedules', 'maintenance_logs',
      'cattle_groups', 'cattle_moves', 'cattle_events',
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

  it('replays equipment, schedule, then atomic maintenance RPC in FIFO order', async () => {
    await syncQueue.enqueueMutation('equipment', 'insert', { id: 'e1' }, 'farm-1');
    await syncQueue.enqueueMutation('maintenance_schedules', 'insert', { id: 's1', equipment_id: 'e1' }, 'farm-1');
    await syncQueue.enqueueMutation('maintenance_logs', 'insert', {
      id: 'l1',
      equipment_id: 'e1',
      __maintenance_rpc: { p_farm_id: 'farm-1', p_log_id: 'l1', p_equipment_id: 'e1' },
    }, 'farm-1');

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);
    expect(supabaseControl.insert).toHaveBeenCalledTimes(2);
    expect(supabaseControl.rpc).toHaveBeenCalledWith('log_maintenance', expect.objectContaining({
      p_log_id: 'l1', p_equipment_id: 'e1',
    }));
    expect(supabaseControl.insert.mock.invocationCallOrder[1])
      .toBeLessThan(supabaseControl.rpc.mock.invocationCallOrder[0]);
  });

  it('accepts a higher cloud equipment reading as a completed queued update', async () => {
    await syncQueue.enqueueMutation('equipment', 'update', {
      id: 'e1', current_reading: 1100, __force_lower_reading: false,
    }, 'farm-1');
    supabaseControl.updateResponses.push({ error: null, count: 0, status: 204 });
    supabaseControl.selectResponses.push({ data: { current_reading: 1200 }, error: null, status: 200 });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('reports an unfinished drain when the only remaining work is parked', async () => {
    await syncQueue.enqueueMutation('equipment', 'insert', { id: 'e1' }, 'farm-1');
    const [queued] = await syncQueue.getQueue('farm-1');
    for (let retry = 0; retry < MAX_SYNC_RETRIES; retry++) {
      await syncQueue.incrementRetry(queued.id, retry);
    }

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    expect(await syncQueue.getFailed('farm-1')).toHaveLength(1);
  });

  it('re-stamps equipment RPCs to the active farm and parks a missing target immediately', async () => {
    await syncQueue.enqueueMutation('equipment', 'update', {
      id: 'e1',
      __equipment_rpc: {
        rpc: 'update_equipment_reading',
        args: { p_farm_id: 'stale-farm', p_equipment_id: 'e1', p_reading: 1200, p_force_lower: false },
      },
    }, 'farm-1');
    supabaseControl.rpcResponses.push({
      data: null,
      error: { code: 'P0002', message: 'Equipment not found' },
      status: 404,
    });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    expect(supabaseControl.rpc).toHaveBeenCalledWith('update_equipment_reading', expect.objectContaining({
      p_farm_id: 'farm-1',
    }));
    const [parked] = await syncQueue.getFailed('farm-1');
    expect(parked).toMatchObject({ retry_count: MAX_SYNC_RETRIES });
  });

  it('registers every cattle RPC the app queues, including transfers and the farm setting', () => {
    expect([...CATTLE_RPCS].sort()).toEqual([
      'log_cattle_event', 'move_cattle_group', 'set_runs_cattle', 'soft_delete_cattle_row', 'transfer_cattle_head',
    ]);
  });

  it('claims every group an envelope touches, including deletes and both transfer groups', () => {
    const ids = (rpc: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      cattleEnvelopeGroupIds({ id: 'x', ...extra, __cattle_rpc: { rpc, args } });
    expect(ids('log_cattle_event', { p_group_id: 'g1' })).toEqual(['g1']);
    expect(ids('transfer_cattle_head', { p_from_group_id: 'g1', p_to_group_id: 'g2' })).toEqual(['g1', 'g2']);
    expect(ids('soft_delete_cattle_row', { p_row_type: 'event', p_row_id: 'e1' }, { group_id: 'g3' })).toEqual(['g3']);
    expect(ids('set_runs_cattle', { p_runs_cattle: true })).toEqual([]);
    expect(cattleEnvelopeGroupIds({ id: 'x' })).toEqual([]);
  });

  it('replays a group edit and a later event RPC for the same group in order', async () => {
    await syncQueue.enqueueMutation('cattle_groups', 'update', { id: 'g1', name: 'Renamed' }, 'farm-1');
    await syncQueue.enqueueMutation('cattle_events', 'insert', {
      id: 'e1',
      __cattle_rpc: { rpc: 'log_cattle_event', args: { p_event_id: 'e1', p_group_id: 'g1', p_event_type: 'death', p_event_date: '2026-01-01', p_head_delta: -1 } },
    }, 'farm-1');
    supabaseControl.updateResponses.push({ error: { code: '500', message: 'server error' }, count: null, status: 500 });
    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    expect(supabaseControl.rpc).not.toHaveBeenCalled();
    expect(await syncQueue.getQueue('farm-1')).toHaveLength(2);
    expect(await syncQueue.replayQueue('farm-1')).toBe(true);
    expect(supabaseControl.update.mock.invocationCallOrder[0]).toBeLessThan(supabaseControl.rpc.mock.invocationCallOrder[0]);
  });

  it('replays a transfer as one RPC with both groups and the farm id', async () => {
    await syncQueue.enqueueMutation('cattle_events', 'insert', {
      id: 'ev-from',
      __cattle_rpc: { rpc: 'transfer_cattle_head', args: { p_from_event_id: 'ev-from', p_to_event_id: 'ev-to', p_from_group_id: 'g1', p_to_group_id: 'g2', p_head: 4, p_event_date: '2026-01-02', p_notes: null } },
    }, 'farm-1');
    expect(await syncQueue.replayQueue('farm-1')).toBe(true);
    expect(supabaseControl.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseControl.rpc).toHaveBeenCalledWith('transfer_cattle_head', expect.objectContaining({
      p_farm_id: 'farm-1', p_from_group_id: 'g1', p_to_group_id: 'g2', p_head: 4,
    }));
  });

  it('replays set_runs_cattle as an RPC and discards a plain farms mutation', async () => {
    await syncQueue.enqueueMutation('farms', 'update', { id: 'farm-1', runs_cattle: true }, 'farm-1');
    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);
    expect(supabaseControl.update).not.toHaveBeenCalled();
    expect(supabaseControl.rpc).not.toHaveBeenCalled();
    expect(await syncQueue.getQueue('farm-1')).toHaveLength(0);

    await syncQueue.enqueueMutation('farms', 'update', {
      id: 'farm-1', __cattle_rpc: { rpc: 'set_runs_cattle', args: { p_runs_cattle: true } },
    }, 'farm-1');
    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(true);
    expect(supabaseControl.rpc).toHaveBeenCalledWith('set_runs_cattle', { p_runs_cattle: true, p_farm_id: 'farm-1' });
  });

  it('parks a cattle RPC whose group is really gone (P0002 with no group insert queued)', async () => {
    await syncQueue.enqueueMutation('cattle_events', 'insert', {
      id: 'e9',
      __cattle_rpc: { rpc: 'log_cattle_event', args: { p_event_id: 'e9', p_group_id: 'gone', p_event_type: 'working', p_event_date: '2026-01-01', p_head_delta: 0 } },
    }, 'farm-1');
    supabaseControl.rpcResponses.push({ data: null, error: { code: 'P0002', message: 'Cattle group not found' }, status: 404 });
    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    const [parked] = await syncQueue.getFailed('farm-1');
    expect(parked).toMatchObject({ table_name: 'cattle_events', retry_count: MAX_SYNC_RETRIES });
  });

  it('parks a gated cattle event at once as "Pro needed to sync", without burning retries', async () => {
    await syncQueue.enqueueMutation('cattle_events', 'insert', {
      id: 'e-pro',
      __cattle_rpc: { rpc: 'log_cattle_event', args: { p_event_id: 'e-pro', p_group_id: 'g1', p_event_type: 'working', p_event_date: '2026-01-01', p_head_delta: 0 } },
    }, 'farm-1');
    supabaseControl.rpcResponses.push({ data: null, error: { code: 'P0402', message: 'premium_required:cattle_events' }, status: 400 });
    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    const [parked] = await syncQueue.getFailed('farm-1');
    expect(parked).toMatchObject({ table_name: 'cattle_events', retry_count: MAX_SYNC_RETRIES });
    expect(toast.info).toHaveBeenCalledWith(ENTITLEMENT_COPY.syncParkedTitle, expect.anything());
  });

  it('keeps a transfer retryable while either group insert is still queued', async () => {
    await syncQueue.enqueueMutation('cattle_events', 'insert', {
      id: 'ev-from',
      __cattle_rpc: { rpc: 'transfer_cattle_head', args: { p_from_event_id: 'ev-from', p_to_event_id: 'ev-to', p_from_group_id: 'g1', p_to_group_id: 'g2', p_head: 1, p_event_date: '2026-01-02', p_notes: null } },
    }, 'farm-1');
    await syncQueue.enqueueMutation('cattle_groups', 'insert', { id: 'g2', name: 'Calves' }, 'farm-1');
    supabaseControl.rpcResponses.push({ data: null, error: { code: 'P0002', message: 'Cattle group not found' }, status: 404 });
    await syncQueue.replayQueue('farm-1');
    const remaining = await syncQueue.getQueue('farm-1');
    expect(remaining.find(item => item.table_name === 'cattle_events')).toMatchObject({ retry_count: 0 });
  });

  it('keeps a cattle move retryable while its group insert is still queued', async () => {
    await syncQueue.enqueueMutation('cattle_moves', 'insert', {
      id: 'm1', group_id: 'g1',
      __cattle_rpc: {
        rpc: 'move_cattle_group',
        args: { p_move_id: 'm1', p_group_id: 'g1', p_field_id: null, p_moved_on: '2026-01-01' },
      },
    }, 'farm-1');
    await syncQueue.enqueueMutation('cattle_groups', 'insert', { id: 'g1', name: 'Cows' }, 'farm-1');
    supabaseControl.rpcResponses.push({ data: null, error: { code: 'P0002', message: 'Cattle group not found' }, status: 404 });

    await expect(syncQueue.replayQueue('farm-1')).resolves.toBe(false);
    const remaining = await syncQueue.getQueue('farm-1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ table_name: 'cattle_moves', retry_count: 0 });
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

  // A persistence failure must not poison the shared web chain: later readers
  // previously inherited the rejected promise, so `.then(fn)` was skipped and
  // the catch swallowed the error — the queue looked empty and pending work
  // was invisible to the pending-count guards.
  it('does not poison later reads after a failed enqueue', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'A' }, 'farm-1');
    const queuedA = await syncQueue.getQueue('farm-1');

    const original = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });
    await expect(
      syncQueue.enqueueMutation('bins', 'insert', { id: 'B' }, 'farm-1')
    ).rejects.toThrow('QuotaExceededError');
    localStorage.setItem = original;

    // A is still durable and must remain visible to later readers.
    expect(await syncQueue.getPendingCount('farm-1')).toBe(1);
    expect(await syncQueue.getQueue('farm-1')).toEqual(queuedA);
  });

  it('dequeues a real mutation after a failed enqueue', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'A' }, 'farm-1');
    const [queued] = await syncQueue.getQueue('farm-1');

    const original = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });
    await expect(
      syncQueue.enqueueMutation('bins', 'insert', { id: 'B' }, 'farm-1')
    ).rejects.toThrow('QuotaExceededError');
    localStorage.setItem = original;

    await syncQueue.dequeueMutation(queued.id);
    expect(await syncQueue.getQueue('farm-1')).toEqual([]);
  });

  it('increments retry count after a failed enqueue', async () => {
    await syncQueue.enqueueMutation('fields', 'insert', { id: 'A' }, 'farm-1');
    const [queued] = await syncQueue.getQueue('farm-1');

    const original = localStorage.setItem;
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });
    await expect(
      syncQueue.enqueueMutation('bins', 'insert', { id: 'B' }, 'farm-1')
    ).rejects.toThrow('QuotaExceededError');
    localStorage.setItem = original;

    await syncQueue.incrementRetry(queued.id, queued.retry_count);
    const queue = await syncQueue.getQueue('farm-1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retry_count).toBe(1);
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
  it.each(['custom_spray_records', 'work_requests', 'maintenance_schedules', 'maintenance_logs'])(
    'retires %s through soft_delete_farm_rows, not a direct UPDATE that RLS refuses',
    async table => {
      await syncQueue.enqueueMutation(table, 'soft_delete', { id: 'r1', deleted_at: '2026-11-21T00:00:00Z' }, 'farm-1');
      supabaseControl.rpcResponses.push({ data: 1, error: null, status: 200 });
      expect(await syncQueue.replayQueue('farm-1')).toBe(true);
      expect(supabaseControl.rpc).toHaveBeenCalledWith('soft_delete_farm_rows', {
        p_farm_id: 'farm-1', p_table: table, p_ids: ['r1'], p_deleted_at: '2026-11-21T00:00:00Z',
      });
      expect(supabaseControl.update).not.toHaveBeenCalled();
      expect(await syncQueue.getPendingCount('farm-1')).toBe(0);
    },
  );

  it('keeps a soft_delete_farm_rows replay queued when the RPC reports zero rows', async () => {
    await syncQueue.enqueueMutation('work_requests', 'soft_delete', { id: 'r1', deleted_at: '2026-11-21T00:00:00Z' }, 'farm-1');
    supabaseControl.rpcResponses.push({ data: 0, error: null, status: 200 });
    expect(await syncQueue.replayQueue('farm-1')).toBe(false);
    expect(await syncQueue.getPendingCount('farm-1')).toBe(1);
  });

  describe('county_assignments replay', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'c1', farm_id: 'farm-1', subject_type: 'field', subject_key: 'f1',
      county_fips: '29083', method: 'geometry', ...over,
    });

    it('retires a county row through the soft-delete RPC, not a direct UPDATE', async () => {
      await syncQueue.enqueueMutation('county_assignments', 'soft_delete', { id: 'c1', deleted_at: '2026-11-19T00:00:00Z' }, 'farm-1');
      expect(await syncQueue.replayQueue('farm-1')).toBe(true);
      expect(supabaseControl.rpc).toHaveBeenCalledWith('soft_delete_county_assignment', {
        p_farm_id: 'farm-1', p_id: 'c1', p_deleted_at: '2026-11-19T00:00:00Z',
      });
      expect(supabaseControl.update).not.toHaveBeenCalled();
      expect(await syncQueue.getPendingCount('farm-1')).toBe(0);
    });

    it('drops a duplicate automatic insert when a live row already exists', async () => {
      await syncQueue.enqueueMutation('county_assignments', 'insert', row(), 'farm-1');
      supabaseControl.insertResponses.push({ error: { code: '23505', message: 'duplicate' }, status: 409 });
      supabaseControl.selectResponses.push({ data: { id: 'other', method: 'geometry' }, error: null, status: 200 });
      expect(await syncQueue.replayQueue('farm-1')).toBe(true);
      expect(supabaseControl.update).not.toHaveBeenCalled();
      expect(await syncQueue.getPendingCount('farm-1')).toBe(0);
    });

    it('applies a queued manual correction onto the live row after an insert conflict', async () => {
      await syncQueue.enqueueMutation('county_assignments', 'insert', row({ method: 'manual', manual_acres: 10 }), 'farm-1');
      supabaseControl.insertResponses.push({ error: { code: '23505', message: 'duplicate' }, status: 409 });
      supabaseControl.selectResponses.push({ data: { id: 'other', method: 'geometry' }, error: null, status: 200 });
      expect(await syncQueue.replayQueue('farm-1')).toBe(true);
      const changes = supabaseControl.update.mock.calls[0][0];
      expect(changes.manual_acres).toBe(10);
      expect(changes).not.toHaveProperty('id');
      expect(changes).not.toHaveProperty('farm_id');
      expect(await syncQueue.getPendingCount('farm-1')).toBe(0);
    });
  });
});
