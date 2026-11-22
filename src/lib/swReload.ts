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

/** Typing within this long counts as editing: a reload would drop the entry. */
export const SW_RELOAD_EDIT_IDLE_MS = 60_000;

function isEditableFocused(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  if (!el || el === document.body) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(type);
}

/**
 * Someone is entering a record (a field has focus, or they typed in the last
 * minute). A reload would drop unsaved form state, so it waits, with no cap:
 * the update applies as soon as they stop. Full-page forms are not dialogs,
 * so the dialog check alone let those reload mid-entry.
 */
export function isEditing(nowMs: number = Date.now(), lastInputAt = Number.NEGATIVE_INFINITY): boolean {
  return isEditableFocused() || nowMs - lastInputAt < SW_RELOAD_EDIT_IDLE_MS;
}

export function shouldDeferReload(
  root: ParentNode = document,
  deferCount = 0,
  nowMs: number = Date.now(),
  lastInputAt = Number.NEGATIVE_INFINITY,
): boolean {
  if (isEditing(nowMs, lastInputAt)) return true;
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
  let lastInputAt = Number.NEGATIVE_INFINITY;
  if (typeof document !== 'undefined') {
    document.addEventListener('input', () => { lastInputAt = now(); }, { capture: true, passive: true });
  }

  const reloadOnce = () => {
    if (reloading || deferred) return;
    if (shouldDeferReload(document, deferCount, now(), lastInputAt)) {
      deferred = true;
      // Only dialog waits count toward the force-apply cap; editing waits do not.
      if (!isEditing(now(), lastInputAt)) deferCount += 1;
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
