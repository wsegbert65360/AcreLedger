/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createReloadOnce,
  MAX_DEFERS,
  SW_RELOAD_DEFER_MS,
  SW_RELOADED_AT_KEY,
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
});
