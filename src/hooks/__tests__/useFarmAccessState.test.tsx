import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFarmAccessState } from '@/hooks/useFarmAccessState';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const control = vi.hoisted(() => ({
  trialEndsAt: '2026-10-01T00:00:00.000Z' as string | null,
  farmError: null as unknown,
  subscription: null as unknown,
  reads: 0,
}));

vi.mock('@/hooks/useTrialClock', () => ({ useTrialClock: () => NOW }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      control.reads += 1;
      const single = async () => table === 'farms'
        ? { data: { trial_ends_at: control.trialEndsAt }, error: control.farmError }
        : { data: control.subscription, error: null };
      return { select: () => ({ eq: () => ({ maybeSingle: single, is: () => ({ maybeSingle: single }) }) }) };
    },
  },
}));

const props = { enforce: true, farmId: 'farm-1', userId: 'user-1', isOnline: true };
beforeEach(() => Object.assign(control, { trialEndsAt: '2026-10-01T00:00:00.000Z', farmError: null, subscription: null, reads: 0 }));

describe('useFarmAccessState', () => {
  it('locks a farm once its ended trial has loaded', async () => {
    const { result } = renderHook(() => useFarmAccessState(props));
    expect(result.current).toEqual({ readOnly: false, reason: 'unknown' });
    await waitFor(() => expect(result.current).toEqual({ readOnly: true, reason: 'trial-ended' }));
  });

  it('fails open when a billing read errors', async () => {
    control.farmError = { message: 'boom' };
    const { result } = renderHook(() => useFarmAccessState(props));
    await waitFor(() => expect(control.reads).toBeGreaterThan(0));
    expect(result.current.readOnly).toBe(false);
  });

  it('reads nothing when enforcement is off', () => {
    const { result } = renderHook(() => useFarmAccessState({ ...props, enforce: false }));
    expect(result.current).toEqual({ readOnly: false, reason: 'not-enforced' });
    expect(control.reads).toBe(0);
  });

  it('keeps the last known state for the same farm while offline', async () => {
    const { result, rerender } = renderHook((p: typeof props) => useFarmAccessState(p), { initialProps: props });
    await waitFor(() => expect(result.current.readOnly).toBe(true));
    rerender({ ...props, isOnline: false });
    expect(result.current.readOnly).toBe(true);
  });

  it('does not carry one farm\'s state to another farm', async () => {
    const { result, rerender } = renderHook((p: typeof props) => useFarmAccessState(p), { initialProps: props });
    await waitFor(() => expect(result.current.readOnly).toBe(true));
    rerender({ ...props, farmId: 'farm-2', isOnline: false });
    expect(result.current).toEqual({ readOnly: false, reason: 'unknown' });
  });
});
