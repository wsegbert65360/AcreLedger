/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCoachmarks } from '../useCoachmarks';

describe('useCoachmarks', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts active when enabled and not previously completed', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    expect(result.current.isActive).toBe(true);
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.totalSteps).toBe(4);
  });

  it('is inactive when disabled', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: false }));
    expect(result.current.isActive).toBe(false);
  });

  it('is inactive when already completed in localStorage', () => {
    window.localStorage.setItem('al_coachmarks_shown_user-1', '1');
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    expect(result.current.isActive).toBe(false);
    expect(result.current.isComplete).toBe(true);
  });

  it('advances through steps with next()', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
  });

  it('marks complete after the last step', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    for (let i = 0; i < 4; i++) {
      act(() => result.current.next());
    }
    expect(result.current.isActive).toBe(false);
    expect(result.current.isComplete).toBe(true);
    expect(window.localStorage.getItem('al_coachmarks_shown_user-1')).toBe('1');
  });

  it('can skip the tour', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    act(() => result.current.skip());
    expect(result.current.isActive).toBe(false);
    expect(window.localStorage.getItem('al_coachmarks_shown_user-1')).toBe('1');
  });

  it('can restart after completion', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    act(() => result.current.skip());
    act(() => result.current.restart());
    expect(result.current.isActive).toBe(true);
    expect(result.current.stepIndex).toBe(0);
  });
});
