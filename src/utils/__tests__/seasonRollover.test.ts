/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearRolloverDismiss,
  dismissRolloverPrompt,
  getRolloverDismissKey,
  isRolloverDismissed,
  openSeasonRolloverModal,
} from '../seasonRollover';

describe('seasonRollover utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds scoped dismiss keys', () => {
    expect(getRolloverDismissKey('user-1', 2026)).toBe('user-1_al_rollover_dismissed_2026');
    expect(getRolloverDismissKey(null, 2026)).toBe('al_rollover_dismissed_2026');
  });

  it('persists dismiss until cleared', () => {
    expect(isRolloverDismissed('user-1', 2026)).toBe(false);
    dismissRolloverPrompt('user-1', 2026);
    expect(isRolloverDismissed('user-1', 2026)).toBe(true);
    clearRolloverDismiss('user-1', 2026);
    expect(isRolloverDismissed('user-1', 2026)).toBe(false);
  });

  it('dispatches open-rollover event', () => {
    let fired = false;
    window.addEventListener('open-rollover', () => { fired = true; });
    openSeasonRolloverModal();
    expect(fired).toBe(true);
  });
});
