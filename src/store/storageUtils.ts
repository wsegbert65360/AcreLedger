/**
 * Local storage utilities for offline resilience.
 * Used by farmStore hooks to persist state to localStorage.
 */

export function loadFromStorage<T>(key: string, fallback: T, userId?: string | null): T {
  try {
    const scopedKey = userId ? `${userId}_${key}` : key;
    const raw = localStorage.getItem(scopedKey);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error loading from storage (${key}):`, error);
    return fallback;
  }
}

export function saveToStorage(key: string, value: unknown, userId?: string | null) {
  try {
    const scopedKey = userId ? `${userId}_${key}` : key;
    localStorage.setItem(scopedKey, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to storage:`, error);
  }
}
