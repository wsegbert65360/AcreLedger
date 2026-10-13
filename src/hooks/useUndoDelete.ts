import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const UNDO_DELAY_MS = 10000;

interface UseUndoDeleteOptions<TContext = unknown> {
  farm_id?: string | null;
  onCommit: (ids: string[], context: TContext, farmId?: string | null) => Promise<void | boolean> | void | boolean;
  onError?: (error: unknown) => void;
}

/**
 * Provides an optimistic delete-with-undo flow.
 *
 * Records are hidden from the UI immediately by the returned `pending` set,
 * but the actual `onCommit` callback (which should perform the Supabase
 * soft-delete) is delayed by 10 seconds so the user can undo from the Sonner
 * toast. Multiple delete batches are tracked independently.
 */
export function useUndoDelete<TContext = unknown>({ onCommit, onError, farm_id }: UseUndoDeleteOptions<TContext>) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingCommitsRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>, ids: string[], context: TContext, farmId?: string | null }>>(new Map());
  const commitChainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const counterRef = useRef(0);

  // Timers and the unmount flush must fire with the freshest callback closure,
  // but callback identity must never re-arm pending commits — callers pass
  // inline arrows (or memoized callbacks invalidated by store refreshes), and
  // keying the flush effect on `onCommit` collapsed the undo window to the next
  // render. Same latest-ref idiom as fetchDataRef in farmStore.tsx.
  const onCommitRef = useRef(onCommit);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCommitRef.current = onCommit;
    onErrorRef.current = onError;
  });

  const queueCommit = useCallback((ids: string[], context: TContext, farmId?: string | null) => {
    commitChainRef.current = commitChainRef.current.then(async () => {
      try {
        const ok = farmId === undefined
          ? await onCommitRef.current(ids, context)
          : await onCommitRef.current(ids, context, farmId);
        if (ok === false) throw new Error('Delete refused because its farm changed or the write failed.');
      } catch (err) {
        console.error('Undo delete commit failed:', err);
        onErrorRef.current?.(err);
      } finally {
        if (mountedRef.current) {
          setPending(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.delete(id));
            return next;
          });
        }
      }
    });
  }, []);

  const clearBatch = useCallback((key: string, ids: string[]) => {
    const entry = pendingCommitsRef.current.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      pendingCommitsRef.current.delete(key);
    }
    setPending(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const requestDelete = useCallback(
    (ids: string[], displayName: string, context: TContext) => {
      if (ids.length === 0) return;

      const key = `${++counterRef.current}-${[...ids].sort().join(',')}`;

      setPending(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });

      const timer = setTimeout(() => {
        pendingCommitsRef.current.delete(key);
        queueCommit(ids, context, farm_id);
      }, UNDO_DELAY_MS);

      pendingCommitsRef.current.set(key, { timer, ids, context, farmId: farm_id });

      toast(displayName, {
        description:
          ids.length === 1
            ? 'Deleting in 10 seconds. Tap Undo to keep this record.'
            : `Deleting ${ids.length} records in 10 seconds. Tap Undo to keep them.`,
        action: {
          label: 'Undo',
          onClick: () => clearBatch(key, ids),
        },
        duration: UNDO_DELAY_MS,
      });
    },
    [clearBatch, farm_id, queueCommit]
  );

  // Flush pending commits on unmount through the same stable serial queue.
  useEffect(() => {
    mountedRef.current = true;
    const pendingCommits = pendingCommitsRef.current;
    return () => {
      mountedRef.current = false;
      pendingCommits.forEach(({ timer, ids, context, farmId }) => {
        clearTimeout(timer);
        queueCommit(ids, context, farmId);
      });
      pendingCommits.clear();
    };
  }, [queueCommit]);

  return { pending, requestDelete };
}
