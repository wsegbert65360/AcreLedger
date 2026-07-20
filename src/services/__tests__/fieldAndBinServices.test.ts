import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';
import type { Field, Bin } from '@/types/farm';

const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));

let fieldService: (typeof import('../fieldService'))['fieldService'];
let binService: (typeof import('../binService'))['binService'];
beforeAll(async () => {
  fieldService = (await import('../fieldService')).fieldService;
  binService = (await import('../binService')).binService;
});

const farmId = 'farm-1';

const baseField: Field = {
  id: 'f1',
  name: 'North 40',
  acreage: 40,
  lat: 38.5,
  lng: -93.5,
  farm_id: farmId,
  deleted_at: null,
};

const baseBin: Bin = {
  id: 'b1',
  name: 'Bin A',
  capacity: 50000,
  farm_id: farmId,
  deleted_at: null,
};

// fieldService and binService are structurally identical thin wrappers. Each
// case binds the table name + a factory for the base record so one set of
// assertions runs against both. These services return raw Supabase results —
// they do NOT internally verify count or roll back; that contract lives in the
// store hooks (Phase 2). Here we lock the query shape + payload discipline.
describe.each([
  {
    label: 'fieldService',
    table: 'fields',
    recordId: 'f1',
    create: (id: string) => {
      const { id: _id, farm_id: _f, ...rest } = baseField;
      return fieldService.createField(rest, id, farmId);
    },
    update: () => fieldService.updateField(baseField, farmId),
    softDelete: () => fieldService.softDeleteField('f1', farmId),
  },
  {
    label: 'binService',
    table: 'bins',
    recordId: 'b1',
    create: (id: string) => {
      const { id: _id, farm_id: _f, ...rest } = baseBin;
      return binService.createBin(rest, id, farmId);
    },
    update: () => binService.updateBin(baseBin, farmId),
    softDelete: () => binService.softDeleteBin('b1', farmId),
  },
] as const)('$label', ({ table, recordId, create, update, softDelete }) => {
  beforeEach(() => {
    mock.reset();
  });

  it('create inserts a farm-scoped mapped payload and selects the result', async () => {
    mock.setResult({ data: [{ id: 'new' }], error: null, count: null });

    await create('new');

    expect(mock.fns.from).toHaveBeenCalledWith(table);
    expect(mock.fns.insert).toHaveBeenCalledWith([
      expect.objectContaining({ farm_id: farmId }),
    ]);
    expect(mock.fns.select).toHaveBeenCalledWith();
  });

  it('update sends a count-exact update scoped to id + farm_id, omitting both from the payload', async () => {
    mock.setResult({ count: 1, data: null, error: null });

    await update();

    expect(mock.fns.update).toHaveBeenCalledWith(expect.any(Object), { count: 'exact' });
    // The destructured update payload must NOT carry id or farm_id (AGENTS.md:
    // "Do not send farm_id inside .update() payloads. Always filter by .eq.")
    const payload = mock.fns.update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('farm_id');
    expect(mock.fns.eq).toHaveBeenNthCalledWith(1, 'id', recordId);
    expect(mock.fns.eq).toHaveBeenNthCalledWith(2, 'farm_id', farmId);
  });

  it('softDelete sets deleted_at via a count-exact update scoped to id + farm_id', async () => {
    if (table === 'fields') {
      mock.setRpcResult({ data: true, error: null });

      const result = await softDelete();

      expect(mock.fns.rpc).toHaveBeenCalledWith('soft_delete_field_with_clu_assignments', {
        p_field_id: recordId,
        p_farm_id: farmId,
      });
      expect(result).toEqual({ count: 1, error: null });
      expect(mock.fns.update).not.toHaveBeenCalled();
      return;
    }

    mock.setResult({ count: 1, data: null, error: null });

    await softDelete();

    expect(mock.fns.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
      { count: 'exact' },
    );
    expect(mock.fns.eq).toHaveBeenNthCalledWith(1, 'id', recordId);
    expect(mock.fns.eq).toHaveBeenNthCalledWith(2, 'farm_id', farmId);
    expect(mock.fns.select).not.toHaveBeenCalled();
  });
});

describe('fieldService atomic delete result', () => {
  beforeEach(() => mock.reset());

  it('normalizes an RPC false result to count zero for hook rollback', async () => {
    mock.setRpcResult({ data: false, error: null });
    await expect(fieldService.softDeleteField('f1', farmId)).resolves.toEqual({ count: 0, error: null });
  });
});
