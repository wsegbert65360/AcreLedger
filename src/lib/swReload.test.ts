/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createReloadOnce,
  MAX_DEFERS,
  SW_RELOAD_COOLDOWN_MS,
  SW_RELOAD_DEFER_MS,
  SW_RELOADED_AT_KEY,
  SW_RELOAD_EDIT_IDLE_MS,
} from './swReload';

describe('service worker reload guard', () => {
  const reload = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    reload.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('defers while a dialog is open', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    createReloadOnce({ reload })();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not defer for an open accordion', () => {
    document.body.innerHTML = '<div data-state="open"></div>';
    createReloadOnce({ reload })();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('force-reloads after MAX_DEFERS', () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
    const reloadOnce = createReloadOnce({ reload });
    reloadOnce();
    expect(reload).not.toHaveBeenCalled();
    for (let i = 0; i < MAX_DEFERS - 1; i += 1) {
      vi.advanceTimersByTime(SW_RELOAD_DEFER_MS);
      expect(reload).not.toHaveBeenCalled();
    }
    vi.advanceTimersByTime(SW_RELOAD_DEFER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while a form field has focus, past the dialog cap, then reloads once editing stops', () => {
    document.body.innerHTML = '<input id="bushels" type="number">';
    const input = document.getElementById('bushels') as HTMLInputElement;
    input.focus();
    const reloadOnce = createReloadOnce({ reload });
    reloadOnce();
    vi.advanceTimersByTime(SW_RELOAD_DEFER_MS * (MAX_DEFERS + 2));
    expect(reload).not.toHaveBeenCalled();
    input.blur();
    vi.advanceTimersByTime(SW_RELOAD_DEFER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits a minute after typing even when focus has left the field', () => {
    let clock = 1_000_000;
    document.body.innerHTML = '<textarea id="notes"></textarea>';
    const reloadOnce = createReloadOnce({ reload, now: () => clock });
    document.getElementById('notes')!.dispatchEvent(new Event('input', { bubbles: true }));
    reloadOnce();
    expect(reload).not.toHaveBeenCalled();
    clock += SW_RELOAD_EDIT_IDLE_MS + 1;
    vi.advanceTimersByTime(SW_RELOAD_DEFER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once when controllerchange and activated both fire', () => {
    const reloadOnce = createReloadOnce({ reload });
    reloadOnce();
    reloadOnce();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('suppresses a second reload when one happened recently', () => {
    sessionStorage.setItem(SW_RELOADED_AT_KEY, String(Date.now()));
    createReloadOnce({ reload })();
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries once when the cooldown window ends and does not stack timers', () => {
    const elapsed = 4_000;
    sessionStorage.setItem(SW_RELOADED_AT_KEY, String(Date.now() - elapsed));
    const reloadOnce = createReloadOnce({ reload });
    const pendingBefore = vi.getTimerCount();
    reloadOnce();
    reloadOnce();
    reloadOnce();
    expect(reload).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(pendingBefore + 1);

    vi.advanceTimersByTime(SW_RELOAD_COOLDOWN_MS - elapsed - 1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SW_RELOAD_COOLDOWN_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
