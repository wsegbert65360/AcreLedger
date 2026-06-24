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
    expect(result.current.pending.has('a')).toBe(false);
    expect(result.current.pending.has('b')).toBe(false);
  });

  it('cancels commit when Undo is clicked', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete({ onCommit }));

    act(() => result.current.requestDelete(['a'], 'Record deleted', null));

    const toastCall = vi.mocked(toast).mock.calls[0];
    const undoAction = (toastCall[1] as { action: { onClick: () => void } }).action;

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
    const firstUndo = (firstToast[1] as { action: { onClick: () => void } }).action;

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
    expect(result.current.pending.has('a')).toBe(false);
  });

  it('passes context to onCommit', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const context = { type: 'spray' as const };
    const { result } = renderHook(() => useUndoDelete<{ type: string }>({ onCommit }));

    act(() => result.current.requestDelete(['a'], 'Record deleted', context));
    act(() => vi.advanceTimersByTime(10000));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(['a'], context));
  });
});
