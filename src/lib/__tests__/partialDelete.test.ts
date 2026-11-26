import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ result: { data: [] as { id: string }[] | null, error: null as unknown } }));
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq']) chain[m] = vi.fn(() => chain);
  chain.is = vi.fn(() => Promise.resolve(query.result));
  return { supabase: { from: vi.fn(() => chain) } };
});
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import { rollbackOnlyStillLive } from '../partialDelete';

type Row = { id: string };
const snapshot = [{ record: { id: 'a' }, index: 0 }, { record: { id: 'b' }, index: 1 }, { record: { id: 'c' }, index: 2 }];
const run = async (live: string[] | null, error: unknown = null) => {
  query.result = { data: live ? live.map(id => ({ id })) : null, error };
  let state: Row[] = [{ id: 'x' }];
  const setState = (update: Row[] | ((prev: Row[]) => Row[])) => { state = typeof update === 'function' ? update(state) : update; };
  const handled = await rollbackOnlyStillLive('plant_records', ['a', 'b', 'c'], 'farm-1', snapshot, setState);
  return { handled, state };
};

describe('rollbackOnlyStillLive', () => {
  beforeEach(() => toastError.mockClear());

  it('puts back only the rows that are still live after a partial delete', async () => {
    const { handled, state } = await run(['b']);
    expect(handled).toBe('partial');
    expect(state.map(r => r.id)).toEqual(['x', 'b']);
    expect(toastError).toHaveBeenCalledWith('2 of 3 deleted. 1 could not be deleted; they are back in the list.');
  });

  it('leaves the full rollback to the caller when nothing was deleted or the check failed; reports all-deleted', async () => {
    expect((await run(['a', 'b', 'c'])).handled).toBe(null);
    expect((await run(null, { message: 'offline' })).handled).toBe(null);
    // None live: they were all deleted (some earlier), so the delete succeeded.
    const all = await run([]);
    expect(all.handled).toBe('all-deleted');
    expect(all.state.map(r => r.id)).toEqual(['x']);
    expect(toastError).not.toHaveBeenCalled();
  });
});
