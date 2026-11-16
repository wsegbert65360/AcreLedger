/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('useCoachmarks replay event', () => {
  it('restarts the tour when the replay event fires', async () => {
    const { COACHMARKS_RESTART_EVENT } = await import('../useCoachmarks');
    window.localStorage.setItem('al_coachmarks_shown_user-1', '1');
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
    expect(result.current.isActive).toBe(false);
    act(() => { window.dispatchEvent(new Event(COACHMARKS_RESTART_EVENT)); });
    expect(result.current.isActive).toBe(true);
    expect(result.current.stepIndex).toBe(0);
  });
});

describe('useCoachmarks without storage', () => {
  it('runs in memory when localStorage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      const { result } = renderHook(() => useCoachmarks({ userId: 'user-1', enabled: true }));
      expect(result.current.isActive).toBe(true);
      act(() => result.current.skip());
      expect(result.current.isActive).toBe(false);
      act(() => result.current.restart());
      expect(result.current.isActive).toBe(true);
    } finally {
      get.mockRestore();
      set.mockRestore();
      remove.mockRestore();
    }
  });

  it('tours Add field, Quick Add, Activity, then Reports', () => {
    const { result } = renderHook(() => useCoachmarks({ userId: 'user-2', enabled: true }));
    expect(result.current.steps.map(s => s.id)).toEqual(['addField', 'quickAdd', 'activity', 'reports']);
  });
});
