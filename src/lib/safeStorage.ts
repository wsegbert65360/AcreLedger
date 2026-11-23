/**
 * localStorage that never throws. Safari private mode, a full quota, or a
 * disabled store make getItem/setItem throw; a remembered preference is never
 * worth crashing a form over.
 */
export function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be saved. */
export function storageSet(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
