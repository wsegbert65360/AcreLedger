import { useEffect, useState } from 'react';

export type SideBarEdge = 'left' | 'right';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Insets smaller than this are rounding, not a strip reserved for system controls. */
const MIN_STRIP_PX = 20;
/**
 * A side strip must be at least this wide to hold the tab rail (48px buttons, 6px padding,
 * 1px border each side = 62px). iPhone Duo's strip is 84px. Narrower one-sided insets, such as
 * an Android phone in landscape with its camera cutout on one side, keep the bottom bar.
 */
const MIN_RAIL_STRIP_PX = 64;
/** At this width and above, the desktop Sidebar replaces the tab bar. */
const DESKTOP_MIN_WIDTH = 1024;
/** WebKit can report new insets a moment after the resize event, so check again. */
const SETTLE_DELAY_MS = 350;

/**
 * iPhone Duo puts the status bar and system controls in a strip along one side of the display
 * (the outer display, and the inner display in landscape) and expects an app's tab bar to sit
 * in that strip too. A landscape iPhone reserves both sides, and portrait reserves the top, so
 * a strip on exactly one side is the signal. This is feature detection, not device detection.
 */
export function sideBarEdgeFor(insets: SafeAreaInsets, viewportWidth: number): SideBarEdge | null {
  if (viewportWidth >= DESKTOP_MIN_WIDTH || insets.top >= MIN_STRIP_PX) return null;
  const right = insets.right >= MIN_STRIP_PX;
  const left = insets.left >= MIN_STRIP_PX;
  if (right && !left) return insets.right >= MIN_RAIL_STRIP_PX ? 'right' : null;
  if (left && !right) return insets.left >= MIN_RAIL_STRIP_PX ? 'left' : null;
  return null;
}

function readSafeAreaInsets(): SafeAreaInsets {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)',
  ].join(';');
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets: SafeAreaInsets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

/**
 * Returns the side where the tab bar belongs, or null for the usual bottom bar. Also sets
 * `html[data-side-bars]` so CSS (index.css, .app-shell) can lay content out around the strip.
 */
export function useSideBarEdge(): SideBarEdge | null {
  const [edge, setEdge] = useState<SideBarEdge | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const measure = () => {
      const next = sideBarEdgeFor(readSafeAreaInsets(), window.innerWidth);
      setEdge(next);
      if (next) root.dataset.sideBars = next;
      else delete root.dataset.sideBars;
    };

    const update = () => {
      measure();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(measure, SETTLE_DELAY_MS);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      delete root.dataset.sideBars;
    };
  }, []);

  return edge;
}
