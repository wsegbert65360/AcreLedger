import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface WizardStepDefinition<TStep extends string> {
  id: TStep;
  label: string;
  ariaLabel?: string;
}

interface WizardNavTheme {
  activeStep: string;
  completedStep: string;
  inactiveStep: string;
  activeLabel: string;
  inactiveLabel: string;
  completedConnector: string;
  inactiveConnector: string;
}

interface WizardNavProps<TStep extends string> {
  steps: WizardStepDefinition<TStep>[];
  currentStep: TStep;
  ariaLabel: string;
  onStepClick?: (step: TStep) => void;
  canClickStep?: (step: TStep, index: number, currentIndex: number) => boolean;
  theme?: Partial<WizardNavTheme>;
}

const DEFAULT_THEME: WizardNavTheme = {
  activeStep: 'bg-primary text-primary-foreground border-primary',
  completedStep: 'bg-primary/20 text-primary border-primary/50',
  inactiveStep: 'bg-muted text-muted-foreground border-border',
  activeLabel: 'text-primary',
  inactiveLabel: 'text-muted-foreground',
  completedConnector: 'bg-primary/50',
  inactiveConnector: 'bg-border',
};

export function WizardNav<TStep extends string>({
  steps,
  currentStep,
  ariaLabel,
  onStepClick,
  canClickStep,
  theme,
}: WizardNavProps<TStep>) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  const mergedTheme = { ...DEFAULT_THEME, ...theme };

  return (
    <div className="flex items-center justify-between gap-1 px-1 py-2" aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = index < currentIndex;
        const isClickable = Boolean(onStepClick && (canClickStep ? canClickStep(step.id, index, currentIndex) : index <= currentIndex + 1));

        return (
          <div key={step.id} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick?.(step.id)}
              disabled={!isClickable}
              className={cn(
                'flex w-full flex-col items-center gap-1 transition-colors',
                isClickable ? 'cursor-pointer' : 'cursor-default',
              )}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${step.ariaLabel ?? step.label}${isCompleted ? ' completed' : ''}`}
            >
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 font-mono text-[11px] font-bold transition-colors',
                  isActive && mergedTheme.activeStep,
                  isCompleted && mergedTheme.completedStep,
                  !isActive && !isCompleted && mergedTheme.inactiveStep,
                )}
              >
                {index + 1}
              </div>
              <span
                className={cn(
                  'hidden text-[9px] font-bold uppercase tracking-wider sm:block',
                  isActive ? mergedTheme.activeLabel : mergedTheme.inactiveLabel,
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-0.5 flex-1 rounded-full transition-colors',
                  index < currentIndex ? mergedTheme.completedConnector : mergedTheme.inactiveConnector,
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

interface WizardStepLayoutProps {
  children: ReactNode;
  className?: string;
}

export function WizardStepLayout({ children, className }: WizardStepLayoutProps) {
  return <div className={cn('py-2', className)}>{children}</div>;
}