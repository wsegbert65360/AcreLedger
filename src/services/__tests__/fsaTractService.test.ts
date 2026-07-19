import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));

// Import the module object (not a destructured binding) so TS infers the real
// shape from the dynamic import. vi.doMock above ensures it receives mock.client.
let svc: typeof import('../fsaTractService');
beforeAll(async () => {
  svc = await import('../fsaTractService');
});

describe('fsaTractService', () => {
  beforeEach(() => {
    mock.reset();
  });

  it('importTract upserts on the sanctioned farm/tract conflict key then selects single', async () => {
    const geojson = { type: 'FeatureCollection', features: [] };
    mock.setResult({ data: { tract_key: 'tract-1' }, error: null, count: null });

    await svc.fsaTractService.importTract(
      't1', 'tract-1', 'tract.geojson', geojson, 12, 'farm-1',
    );

    // The farm_id,tract_key conflict key is the load-bearing invariant: a
    // re-import must replace the existing row rather than collide. Do not
    // regress this to a plain insert.
    expect(mock.fns.from).toHaveBeenCalledWith('fsa_tract_imports');
    expect(mock.fns.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        farm_id: 'farm-1',
        tract_key: 'tract-1',
        filename: 'tract.geojson',
        feature_count: 12,
        geojson,
        deleted_at: null,
      }),
      { onConflict: 'farm_id,tract_key' },
    );
    expect(mock.fns.select).toHaveBeenCalledWith();
    expect(mock.fns.single).toHaveBeenCalledWith();
  });

  it('fetchTracts selects active tracts scoped to the farm, ordered by import time', async () => {
    mock.setResult({ data: [], error: null, count: null });

    await svc.fsaTractService.fetchTracts('farm-1');

    expect(mock.fns.from).toHaveBeenCalledWith('fsa_tract_imports');
    expect(mock.fns.select).toHaveBeenCalledWith('*');
    expect(mock.fns.eq).toHaveBeenCalledWith('farm_id', 'farm-1');
    expect(mock.fns.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mock.fns.order).toHaveBeenCalledWith('imported_at', { ascending: true });
  });

  it('deleteTract calls the soft_delete_fsa_tract RPC with tract + farm args', async () => {
    mock.setRpcResult({ error: null, data: null, count: null });

    await svc.fsaTractService.deleteTract('t1', 'farm-1');

    expect(mock.fns.rpc).toHaveBeenCalledWith('soft_delete_fsa_tract', {
      p_tract_id: 't1',
      p_farm_id: 'farm-1',
    });
  });
});
