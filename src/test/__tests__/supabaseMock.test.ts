import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

// This contract test drives `mock.client` directly. The consumer pattern
// (`vi.doMock('@/lib/supabase', ...)` + dynamic import) is validated end-to-end
// by the service suites that depend on this helper — here we isolate the
// mock's thenable/RPC/reset semantics.
const mock = createSupabaseMock();
// Keep a doMock on the books so the helper is exercised through the same
// registration path consumers use; it must not throw at import time.
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));

describe('supabaseMock', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('resolves an awaited chain to the configured result and records chain args', async () => {
    mock.setResult({ count: 7, data: [{ id: 'r1' }], error: null });

    const res = await mock.client
      .from('fields')
      .update({ name: 'Updated' }, { count: 'exact' })
      .eq('id', 'f1')
      .eq('farm_id', 'farm-1');

    expect(res).toEqual({ count: 7, data: [{ id: 'r1' }], error: null });
    expect(mock.fns.from).toHaveBeenCalledWith('fields');
    expect(mock.fns.update).toHaveBeenCalledWith({ name: 'Updated' }, { count: 'exact' });
    expect(mock.fns.eq).toHaveBeenNthCalledWith(1, 'id', 'f1');
    expect(mock.fns.eq).toHaveBeenNthCalledWith(2, 'farm_id', 'farm-1');
  });

  it('records .in() array args on the chain (used by bulk delete)', async () => {
    mock.setResult({ count: 2, data: null, error: null });

    const res = await mock.client
      .from('grain_movements')
      .update({ deleted_at: '2026-07-19T00:00:00.000Z' }, { count: 'exact' })
      .in('id', ['g1', 'g2'])
      .eq('farm_id', 'farm-1');

    expect(res).toEqual({ count: 2, data: null, error: null });
    expect(mock.fns.in).toHaveBeenCalledWith('id', ['g1', 'g2']);
    expect(mock.fns.eq).toHaveBeenCalledWith('farm_id', 'farm-1');
  });

  it('rejects when a throw is set, while still recording the chain calls', async () => {
    mock.setThrow(new Error('boom'));

    await expect(
      mock.client.from('fields').update({ name: 'X' }, { count: 'exact' }).eq('id', 'f1'),
    ).rejects.toThrow('boom');

    // Chain was still driven — a rollback path can inspect recorded calls.
    expect(mock.fns.update).toHaveBeenCalledWith({ name: 'X' }, { count: 'exact' });
    expect(mock.fns.eq).toHaveBeenCalledWith('id', 'f1');
  });

  it('keeps the rpc terminal independent of the from(...) chain terminal', async () => {
    mock.setResult({ count: 1, data: 'from-data', error: null });
    mock.setRpcResult({ count: null, data: 'rpc-data', error: null });

    const fromRes = await mock.client.from('fields').select('*');
    const rpcRes = await mock.client.rpc('soft_delete_fsa_tract', { p_tract_id: 't1' });

    expect(fromRes.data).toBe('from-data');
    expect(rpcRes.data).toBe('rpc-data');
    expect(mock.fns.rpc).toHaveBeenCalledWith('soft_delete_fsa_tract', { p_tract_id: 't1' });
  });

  it('keeps per-table results isolated when queries resolve concurrently', async () => {
    mock.setTableHandler('fsa_tract_imports', {
      data: [{ id: 'tract-1' }], error: null, count: null,
    });
    mock.setTableHandler('field_clu_assignments', {
      data: [{ id: 'assignment-1' }], error: null, count: null,
    });

    const tractQuery = mock.client.from('fsa_tract_imports').select('*');
    const assignmentQuery = mock.client.from('field_clu_assignments').select('*');
    const [tractResult, assignmentResult] = await Promise.all([tractQuery, assignmentQuery]);

    expect(tractResult.data).toEqual([{ id: 'tract-1' }]);
    expect(assignmentResult.data).toEqual([{ id: 'assignment-1' }]);
  });

  it('reset() restores default behavior for a second call after throw/handler/rpc state is set', async () => {
    // Poison all terminals, then reset, then prove a fresh chain resolves to
    // the default — i.e. reset() re-installs the implementations mockReset
    // would otherwise strip.
    mock.setThrow(new Error('should-be-cleared'));
    mock.setRpcThrow(new Error('should-be-cleared'));
    mock.setTableHandler('fields', { count: 99, data: 'handler', error: null });

    mock.reset();

    const res = await mock.client.from('fields').update({ name: 'Y' }, { count: 'exact' });
    expect(res).toEqual({ count: 1, data: null, error: null });

    const rpcRes = await mock.client.rpc('anything', {});
    expect(rpcRes).toEqual({ count: 1, data: null, error: null });
  });
});
