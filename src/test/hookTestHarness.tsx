import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';

/**
 * Stateful hook-test harness.
 *
 * Why this exists: plain `vi.fn()` setters do NOT execute functional updates
 * like `setRecords(prev => [...prev, record])`. So if a hook's optimistic
 * update / rollback uses the functional form (most do), a `vi.fn()` setter
 * would silently make "record was appended" and "snapshot restored" assertions
 * meaningless — they'd pass regardless of what the hook did.
 *
 * This harness is itself a hook: call it INSIDE the consumer's renderHook so
 * the hook under test and the stateful arrays share ONE React root. Functional
 * updaters run against actual state, so optimistic append, rollback-to-previous,
 * and restore-at-original-index can be asserted honestly.
 *
 * Usage:
 *   const { result } = renderHook(() => {
 *     const grains = useStatefulArray<GrainMovement>([existing]);
 *     const ops = useGrainMovements({
 *       ...otherArgs,
 *       grainMovements: grains.value,
 *       setGrainMovements: grains.setValue,
 *     });
 *     return { grains, ops };
 *   });
 *   await result.current.ops.addGrainMovement(...);
 *   expect(result.current.grains.value).toHaveLength(2);  // honest
 *
 * Read `result.current.grains.value` AFTER awaiting a mutation — renderHook
 * updates result.current on each re-render.
 */
export interface StatefulArray<T> {
  /** Latest committed state. Read after awaiting a hook mutation. */
  value: T[];
  /** Real useState setter — pass this into the hook under test. */
  setValue: React.Dispatch<React.SetStateAction<T[]>>;
}

export function useStatefulArray<T>(initial: T[]): StatefulArray<T> {
  const [value, setValue] = useState<T[]>(initial);
  return { value, setValue };
}

/**
 * Flush pending React state updates after a hook mutation that doesn't await
 * (e.g. a synchronous guard rejection). Wrap async mutations in
 * `await act(async () => ...)` instead.
 */
export async function flushState(): Promise<void> {
  await act(async () => {});
}

// Re-export for convenience so test files import from one place.
export { renderHook, act };
