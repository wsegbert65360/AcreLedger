/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUndoDelete } from '../useUndoDelete';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

describe('useUndoDelete', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(toast).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides ids immediately and commits after the undo window', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete({ onCommit }));

    act(() => result.current.requestDelete(['a', 'b'], '2 records deleted', null));

    expect(result.current.pending.has('a')).toBe(true);
    expect(result.current.pending.has('b')).toBe(true);
    expect(toast).toHaveBeenCalledWith(
      '2 records deleted',
      expect.objectContaining({
        description: expect.stringContaining('Deleting 2 records'),
        action: expect.objectContaining({ label: 'Undo' }),
        duration: 10000,
      })
    );

    act(() => vi.advanceTimersByTime(10000));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(['a', 'b'], null));
    await waitFor(() => {
      expect(result.current.pending.has('a')).toBe(false);
      expect(result.current.pending.has('b')).toBe(false);
    });
  });

  it('cancels commit when Undo is clicked', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete({ onCommit }));

    act(() => result.current.requestDelete(['a'], 'Record deleted', null));

    const toastCall = vi.mocked(toast).mock.calls[0];
    const undoAction = (toastCall[1] as unknown as { action: { onClick: () => void } }).action;

    act(() => undoAction.onClick());

    expect(result.current.pending.has('a')).toBe(false);

    act(() => vi.advanceTimersByTime(10000));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('supports multiple independent delete batches', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete({ onCommit }));

    act(() => result.current.requestDelete(['a'], 'A deleted', null));
    act(() => result.current.requestDelete(['b'], 'B deleted', null));

    expect(result.current.pending.has('a')).toBe(true);
    expect(result.current.pending.has('b')).toBe(true);

    const firstToast = vi.mocked(toast).mock.calls[0];
    const firstUndo = (firstToast[1] as unknown as { action: { onClick: () => void } }).action;

    act(() => firstUndo.onClick());

    expect(result.current.pending.has('a')).toBe(false);
    expect(result.current.pending.has('b')).toBe(true);

    act(() => vi.advanceTimersByTime(10000));

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(['b'], null);
  });

  it('clears ids from pending when commit fails', async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error('network'));
    const onError = vi.fn();
    const { result } = renderHook(() => useUndoDelete({ onCommit, onError }));

    act(() => result.current.requestDelete(['a'], 'Record deleted', null));
    act(() => vi.advanceTimersByTime(10000));

    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    await waitFor(() => expect(onError).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pending.has('a')).toBe(false));
  });

  it('passes context to onCommit', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const context = { type: 'spray' as const };
    const { result } = renderHook(() => useUndoDelete<{ type: string }>({ onCommit }));

    act(() => result.current.requestDelete(['a'], 'Record deleted', context));
    act(() => vi.advanceTimersByTime(10000));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(['a'], context));
  });

  it('keeps the undo window open when the parent re-renders with a new onCommit identity', async () => {
    const firstCommit = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ cb }) => useUndoDelete<string>({ onCommit: cb }),
      { initialProps: { cb: firstCommit } },
    );

    act(() => result.current.requestDelete(['a'], 'Record deleted', 'ctx'));

    // Parent re-render with a brand-new inline callback — the Activity.tsx
    // pattern that used to flush the commit synchronously in the effect cleanup.
    const secondCommit = vi.fn().mockResolvedValue(undefined);
    act(() => rerender({ cb: secondCommit }));

    expect(firstCommit).not.toHaveBeenCalled();
    expect(secondCommit).not.toHaveBeenCalled();
    expect(result.current.pending.has('a')).toBe(true);

    act(() => vi.advanceTimersByTime(10000));
    await waitFor(() => expect(secondCommit).toHaveBeenCalledWith(['a'], 'ctx'));
    expect(firstCommit).not.toHaveBeenCalled();
  });

  it('does not mutate the caller-provided ids array', () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete({ onCommit }));

    const ids = ['b', 'a'];
    act(() => result.current.requestDelete(ids, 'Records deleted', null));

    expect(ids).toEqual(['b', 'a']);
  });

  it('flushes pending commits on unmount', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useUndoDelete({ onCommit }));

    act(() => result.current.requestDelete(['a'], 'Record deleted', null));
    act(() => unmount());

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(['a'], null));
  });
  it.each(['timer', 'unmount'])('serializes same-hook batches on %s even when the first fails', async (path) => {
    let release!: () => void;
    let busy = false;
    const onCommit = vi.fn(async (ids: string[]) => {
      if (busy) return false;
      busy = true;
      if (ids[0] === 'a') {
        await new Promise<void>(resolve => { release = resolve; });
        busy = false;
        throw new Error('first batch failed');
      }
      busy = false;
      return true;
    });
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => useUndoDelete({ onCommit, onError }));
    act(() => {
      result.current.requestDelete(['a'], 'A', null);
      result.current.requestDelete(['b'], 'B', null);
    });
    if (path === 'unmount') unmount();
    else act(() => vi.advanceTimersByTime(10000));
    await act(async () => { await Promise.resolve(); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls.map(call => call[0])).toEqual([['a'], ['b']]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('passes the requesting farm to the freshest callback after a farm switch', async () => {
    const onCommit = vi.fn().mockResolvedValue(false);
    const onError = vi.fn();
    const { result, rerender } = renderHook(({ farm }) => useUndoDelete({ farm_id: farm, onCommit, onError }), {
      initialProps: { farm: 'farm-1' },
    });
    act(() => result.current.requestDelete(['a'], 'A', null));
    rerender({ farm: 'farm-2' });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(onCommit).toHaveBeenCalledWith(['a'], null, 'farm-1');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.pending.size).toBe(0);
  });

});
