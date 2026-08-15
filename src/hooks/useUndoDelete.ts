import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const UNDO_DELAY_MS = 10000;

interface UseUndoDeleteOptions<TContext = unknown> {
  onCommit: (ids: string[], context: TContext) => Promise<void> | void;
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
export function useUndoDelete<TContext = unknown>({ onCommit, onError }: UseUndoDeleteOptions<TContext>) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingCommitsRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>, ids: string[], context: TContext }>>(new Map());
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

      const timer = setTimeout(async () => {
        pendingCommitsRef.current.delete(key);
        try {
          await onCommitRef.current(ids, context);
        } catch (err) {
          console.error('Undo delete commit failed:', err);
          onErrorRef.current?.(err);
        } finally {
          setPending(prev => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            ids.forEach(id => next.delete(id));
            return next;
          });
        }
      }, UNDO_DELAY_MS);

      pendingCommitsRef.current.set(key, { timer, ids, context });

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
    [clearBatch]
  );

  // Flush pending commits only on real unmount. Intentionally keyed on nothing:
  // see the onCommitRef note above.
  useEffect(() => {
    const pendingCommits = pendingCommitsRef.current;
    return () => {
      pendingCommits.forEach(({ timer, ids, context }) => {
        clearTimeout(timer);
        // Flush on unmount
        const promise = onCommitRef.current(ids, context);
        if (promise) {
          promise.catch((err: any) => {
            console.error('Undo delete unmount commit failed:', err);
          });
        }
      });
      pendingCommits.clear();
    };
  }, []);

  return { pending, requestDelete };
}
