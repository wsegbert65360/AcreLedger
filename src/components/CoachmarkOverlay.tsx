import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachmarkStep } from '@/hooks/useCoachmarks';

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

function CoachmarkOverlay({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  isLast
}: CoachmarkOverlayProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = document.getElementById(step.targetId);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    });
  }, [step.targetId]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const handleResize = () => measure();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (!targetRect || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let top = 0;
    let left = 0;

    const placement = step.placement || 'bottom';

    if (placement === 'bottom') {
      top = targetRect.top + targetRect.height + margin + window.scrollY;
      left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2 + window.scrollX;
    } else if (placement === 'top') {
      top = targetRect.top - tooltipRect.height - margin + window.scrollY;
      left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2 + window.scrollX;
    } else if (placement === 'left') {
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2 + window.scrollY;
      left = targetRect.left - tooltipRect.width - margin + window.scrollX;
    } else {
      top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2 + window.scrollY;
      left = targetRect.left + targetRect.width + margin + window.scrollX;
    }

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, viewportW - tooltipRect.width - margin + window.scrollX));
    top = Math.max(margin + window.scrollY, Math.min(top, viewportH - tooltipRect.height - margin + window.scrollY));

    setTooltipPos({ top, left });
  }, [targetRect, step]);

  if (!targetRect) return null;

  const padding = 8;
  const spotlightTop = targetRect.top - padding;
  const spotlightLeft = targetRect.left - padding;
  const spotlightWidth = targetRect.width + padding * 2;
  const spotlightHeight = targetRect.height + padding * 2;

  return (
    <div className="fixed inset-0 z-[100]" aria-label="Onboarding coachmark">
      {/* Backdrop with cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="coachmark-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={spotlightLeft}
              y={spotlightTop}
              width={spotlightWidth}
              height={spotlightHeight}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#coachmark-mask)"
        />
      </svg>

      {/* Click blocking layers around the spotlight */}
      <div className="absolute top-0 left-0 right-0 pointer-events-auto" style={{ height: spotlightTop }} />
      <div className="absolute left-0 pointer-events-auto" style={{ top: spotlightTop, width: spotlightLeft, height: spotlightHeight }} />
      <div className="absolute right-0 pointer-events-auto" style={{ top: spotlightTop, left: spotlightLeft + spotlightWidth, height: spotlightHeight }} />
      <div className="absolute bottom-0 left-0 right-0 pointer-events-auto" style={{ top: spotlightTop + spotlightHeight }} />

      {/* Pulsing highlight ring */}
      <div
        className="absolute rounded-xl border-2 border-primary animate-pulse pointer-events-none"
        style={{
          top: spotlightTop,
          left: spotlightLeft,
          width: spotlightWidth,
          height: spotlightHeight
        }}
      />

      {/* Tooltip */}
      {tooltipPos && (
        <div
          ref={tooltipRef}
          className="absolute max-w-xs w-[calc(100vw-2rem)] bg-card border border-primary/30 rounded-2xl shadow-2xl p-4 pointer-events-auto"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="coachmark-title"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 id="coachmark-title" className="text-sm font-bold text-foreground">
              {step.title}
            </h3>
            <button
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Skip tour"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {step.body}
          </p>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i === stepIndex ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 text-xs">
                  <ChevronLeft size={14} className="mr-0.5" />
                  Back
                </Button>
              )}
              <Button size="sm" onClick={onNext} className="h-8 px-3 text-xs bg-primary hover:bg-primary/90">
                {isLast ? 'Finish' : 'Next'}
                {!isLast && <ChevronRight size={14} className="ml-0.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CoachmarkOverlay;
