/**
 * How long to keep looking for a step's target once no route is still loading.
 * After that the step is shown centered (no spotlight) instead of being skipped.
 */
export const TARGET_WAIT_MS = 4000;

/** Marks the lazy-route Suspense fallback. While it is on screen the tour keeps waiting. */
export const ROUTE_FALLBACK_ATTR = 'data-route-fallback';

export function isRouteLoading(): boolean {
  return document.querySelector(`[${ROUTE_FALLBACK_ATTR}]`) !== null;
}

/**
 * Mobile bottom nav uses the id; the desktop sidebar uses data-coachmark.
 * Only one of them is visible at a time, so pick the first with a real box.
 */
export function findCoachmarkTarget(targetId: string): HTMLElement | null {
  const candidates = [
    document.getElementById(targetId),
    ...Array.from(document.querySelectorAll<HTMLElement>(`[data-coachmark="${targetId}"]`)),
  ];
  return candidates.find(c => c && c.getBoundingClientRect().width > 0) ?? null;
}
