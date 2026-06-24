import { SprayWizardStep } from '@/hooks/useSprayForm';
import { cn } from '@/lib/utils';

interface SprayWizardNavProps {
  steps: SprayWizardStep[];
  currentStep: SprayWizardStep;
  onStepClick?: (step: SprayWizardStep) => void;
}

const STEP_LABELS: Record<SprayWizardStep, string> = {
  core: 'Core Info',
  mix: 'Chemical Mix',
  conditions: 'Conditions',
  review: 'Review'
};

export function SprayWizardNav({ steps, currentStep, onStepClick }: SprayWizardNavProps) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex items-center justify-between gap-1 px-1 py-2" aria-label="Spray record steps">
      {steps.map((step, idx) => {
        const isActive = step === currentStep;
        const isCompleted = idx < currentIndex;
        const isClickable = onStepClick && (idx <= currentIndex || idx === currentIndex + 1);

        return (
          <div key={step} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={cn(
                'flex flex-col items-center gap-1 w-full transition-colors',
                isClickable ? 'cursor-pointer' : 'cursor-default'
              )}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${STEP_LABELS[step]}${isCompleted ? ' completed' : ''}`}
            >
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold font-mono border-2 transition-colors',
                  isActive && 'bg-spray text-white border-spray',
                  isCompleted && 'bg-spray/20 text-spray border-spray/50',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground border-border'
                )}
              >
                {idx + 1}
              </div>
              <span
                className={cn(
                  'text-[9px] font-bold uppercase tracking-wider hidden sm:block',
                  isActive ? 'text-spray' : 'text-muted-foreground'
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-1 rounded-full transition-colors',
                  idx < currentIndex ? 'bg-spray/50' : 'bg-border'
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
