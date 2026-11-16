/** How long to wait for a coachmark step's target to mount (lazy routes) before skipping the step. */
export const TARGET_WAIT_MS = 2000;

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
