import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachmarkStep } from '@/hooks/useCoachmarks';
import { TARGET_WAIT_MS, findCoachmarkTarget, isRouteLoading } from '@/lib/coachmarkTarget';

interface CoachmarkOverlayProps {
  step: CoachmarkStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isLast: boolean;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * While the tour is open everything else on the page is inert and hidden from
 * assistive technology. The overlay lives in its own body-level host so it is
 * the only thing left interactive. Previous attribute values are put back on close.
 */
function useInertBackground(host: HTMLElement) {
  useLayoutEffect(() => {
    document.body.appendChild(host);
    const previousFocus = document.activeElement as HTMLElement | null;
    const changed: Array<{ el: Element; inert: string | null; hidden: string | null }> = [];
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.tagName === 'SCRIPT') continue;
      changed.push({ el, inert: el.getAttribute('inert'), hidden: el.getAttribute('aria-hidden') });
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    }
    return () => {
      for (const { el, inert, hidden } of changed) {
        if (inert === null) el.removeAttribute('inert'); else el.setAttribute('inert', inert);
        if (hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', hidden);
      }
      host.remove();
      // Give focus back to wherever it was, now that it is no longer inert.
      previousFocus?.focus?.();
    };
  }, [host]);
}

function CoachmarkOverlay({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  isLast
}: CoachmarkOverlayProps) {
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('data-coachmark-host', '');
    return el;
  });
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  // No target after waiting: show the step centered instead of skipping it.
  const [centered, setCentered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useInertBackground(host);

  // The overlay is position:fixed, so everything stays in viewport coordinates.
  const measure = useCallback((): boolean => {
    const el = findCoachmarkTarget(step.targetId);
    if (!el) {
      setTargetRect(null);
      return false;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setCentered(false);
    return true;
  }, [step.targetId]);

  // The target may not exist yet. While a lazy route is still loading, keep
  // waiting; once it has finished, look for TARGET_WAIT_MS more, then fall back
  // to a centered tooltip so the step is never lost.
  useLayoutEffect(() => {
    setCentered(false);
    if (measure()) return;
    let frame = 0;
    let started = Date.now();
    const tick = () => {
      if (measure()) return;
      if (isRouteLoading()) {
        started = Date.now();
      } else if (Date.now() - started >= TARGET_WAIT_MS) {
        setCentered(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [measure]);

  useEffect(() => {
    const handleResize = () => { measure(); };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [measure]);

  // The tooltip is always rendered once it has a place to go (hidden until
  // placed), so it can be measured here.
  useLayoutEffect(() => {
    if (!tooltipRef.current || (!targetRect && !centered)) {
      setTooltipPos(null);
      return;
    }

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    if (!targetRect) {
      setTooltipPos({
        top: Math.max(margin, (viewportH - tooltipRect.height) / 2),
        left: Math.max(margin, (viewportW - tooltipRect.width) / 2),
      });
      return;
    }

    const placement = step.placement || 'bottom';
    let top: number;
    let left: number;
    if (placement === 'bottom') {
      top = targetRect.top + targetRect.height + margin;
      left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    } else if (placement === 'top') {
      top = targetRect.top - tooltipRect.height - margin;
      left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    } else if (placement === 'left') {
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
      left = targetRect.left - tooltipRect.width - margin;
    } else {
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
      left = targetRect.left + targetRect.width + margin;
    }

    left = Math.max(margin, Math.min(left, viewportW - tooltipRect.width - margin));
    top = Math.max(margin, Math.min(top, viewportH - tooltipRect.height - margin));

    setTooltipPos({ top, left });
  }, [targetRect, centered, step]);

  const visible = targetRect !== null || centered;

  // Move focus into the tooltip on each step.
  useEffect(() => {
    if (visible) nextRef.current?.focus();
  }, [visible, stepIndex]);

  // Escape skips; Tab stays inside the tooltip.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
        return;
      }
      if (e.key !== 'Tab' || !tooltipRef.current) return;
      const items = Array.from(tooltipRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!tooltipRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onSkip]);

  if (!visible) return null;

  const padding = 8;
  const spot = targetRect && {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="coachmark-overlay">
      {/* Backdrop with cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <defs>
          <mask id="coachmark-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spot && (
              <rect x={spot.left} y={spot.top} width={spot.width} height={spot.height} rx="12" fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#coachmark-mask)" />
      </svg>

      {/* One full-screen click blocker, spotlight included: the highlighted control
          is shown, not used. The tour only moves with Next, Back, Skip or Escape. */}
      <div
        className="absolute inset-0 pointer-events-auto"
        data-testid="coachmark-click-blocker"
        aria-hidden="true"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />

      {/* Pulsing highlight ring */}
      {spot && (
        <div
          aria-hidden="true"
          className="absolute rounded-xl border-2 border-primary animate-pulse pointer-events-none"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}

      {/* Tooltip: rendered hidden first so it can be measured, then placed. */}
      <div
        ref={tooltipRef}
        className="absolute max-w-xs w-[calc(100vw-2rem)] bg-card border border-primary/30 rounded-2xl shadow-2xl p-4 pointer-events-auto"
        style={tooltipPos
          ? { top: tooltipPos.top, left: tooltipPos.left }
          : { top: 0, left: 0, visibility: 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coachmark-title"
        aria-describedby="coachmark-body"
        data-placement={spot ? 'target' : 'centered'}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 id="coachmark-title" className="text-sm font-bold text-foreground pt-1">
            {step.title}
            <span className="sr-only">{` (step ${stepIndex + 1} of ${totalSteps})`}</span>
          </h3>
          <button
            type="button"
            onClick={onSkip}
            className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Skip tour"
          >
            <X size={16} />
          </button>
        </div>
        <p id="coachmark-body" className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {step.body}
        </p>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${i === stepIndex ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="ghost" size="sm" onClick={onBack} className="h-11 min-w-11 px-3 text-xs">
                <ChevronLeft size={14} className="mr-0.5" />
                Back
              </Button>
            )}
            <Button ref={nextRef} size="sm" onClick={onNext} className="h-11 min-w-11 px-4 text-xs bg-primary hover:bg-primary/90">
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight size={14} className="ml-0.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    host,
  );
}

export default CoachmarkOverlay;
