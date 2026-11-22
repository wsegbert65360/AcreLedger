import { afterEach, describe, expect, it, vi } from 'vitest';

import { storageGet, storageSet } from './safeStorage';

describe('safeStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reads and writes normally', () => {
    expect(storageSet('k', 'v')).toBe(true);
    expect(storageGet('k')).toBe('v');
    expect(storageGet('missing')).toBeNull();
  });

  it('swallows a throwing store (Safari private mode, full quota)', () => {
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('QuotaExceededError'); });
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => { throw new DOMException('SecurityError'); });
    expect(storageSet('k', 'v')).toBe(false);
    expect(storageGet('k')).toBeNull();
  });
});
