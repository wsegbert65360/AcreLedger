/** How long a pending update waits for an open dialog before retrying. */
export const SW_RELOAD_DEFER_MS = 30_000;

/**
 * Upper bound on dialog deferrals. At 30s each this is about 5 minutes, then
 * the update is force-applied so a long-lived overlay cannot block it.
 */
export const MAX_DEFERS = 10;

/** Ignore another reload trigger this soon after one already ran. */
export const SW_RELOAD_COOLDOWN_MS = 10_000;

export const SW_RELOADED_AT_KEY = 'al_sw_reloaded_at';

const OVERLAY_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

export function shouldDeferReload(root: ParentNode = document, deferCount = 0): boolean {
  return !!root.querySelector(OVERLAY_SELECTOR) && deferCount < MAX_DEFERS;
}

/**
 * One reload path for service-worker activation and controller changes.
 * A second trigger in the same page is ignored. A trigger within 10 seconds
 * of a reload that already ran waits out the rest of that window, then runs
 * once. Repeated triggers share that single timer.
 */
export function createReloadOnce(overrides: {
  reload?: () => void;
  now?: () => number;
} = {}): () => void {
  const reload = overrides.reload ?? (() => window.location.reload());
  const now = overrides.now ?? (() => Date.now());
  let reloading = false;
  let deferred = false;
  let deferCount = 0;
  let retryTimer: number | undefined;

  const reloadOnce = () => {
    if (reloading || deferred) return;
    if (shouldDeferReload(document, deferCount)) {
      deferred = true;
      deferCount += 1;
      window.setTimeout(() => {
        deferred = false;
        reloadOnce();
      }, SW_RELOAD_DEFER_MS);
      return;
    }
    const raw = sessionStorage.getItem(SW_RELOADED_AT_KEY);
    if (raw !== null) {
      const last = Number(raw);
      if (Number.isFinite(last)) {
        const elapsed = now() - last;
        if (elapsed < SW_RELOAD_COOLDOWN_MS) {
          if (retryTimer === undefined) {
            retryTimer = window.setTimeout(() => {
              retryTimer = undefined;
              reloadOnce();
            }, SW_RELOAD_COOLDOWN_MS - elapsed);
          }
          return;
        }
      }
    }
    reloading = true;
    sessionStorage.setItem(SW_RELOADED_AT_KEY, String(now()));
    reload();
  };

  return reloadOnce;
}
