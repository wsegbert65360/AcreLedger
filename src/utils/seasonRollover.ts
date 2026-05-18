/** Dispatches the global event listened to by SeasonRolloverModal. */
export function openSeasonRolloverModal(): void {
  window.dispatchEvent(new CustomEvent('open-rollover'));
}

export function getRolloverDismissKey(userId: string | null | undefined, targetYear: number): string {
  const base = `al_rollover_dismissed_${targetYear}`;
  return userId ? `${userId}_${base}` : base;
}

export function isRolloverDismissed(userId: string | null | undefined, targetYear: number): boolean {
  try {
    return localStorage.getItem(getRolloverDismissKey(userId, targetYear)) === '1';
  } catch {
    return false;
  }
}

export function dismissRolloverPrompt(userId: string | null | undefined, targetYear: number): void {
  try {
    localStorage.setItem(getRolloverDismissKey(userId, targetYear), '1');
  } catch {
    /* ignore */
  }
}

export function clearRolloverDismiss(userId: string | null | undefined, targetYear: number): void {
  try {
    localStorage.removeItem(getRolloverDismissKey(userId, targetYear));
  } catch {
    /* ignore */
  }
}
