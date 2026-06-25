import { useCallback, useMemo, useState } from 'react';

interface UseWizardStepsOptions<TStep extends string> {
  steps: readonly TStep[];
  initialStep?: TStep;
}

export function useWizardSteps<TStep extends string>({ steps, initialStep }: UseWizardStepsOptions<TStep>) {
  const firstStep = initialStep ?? steps[0];
  const [step, setStep] = useState<TStep>(firstStep);

  const stepIndex = steps.indexOf(step);
  const isFirstStep = stepIndex <= 0;
  const isLastStep = stepIndex === steps.length - 1;

  const goNext = useCallback(() => {
    setStep((current) => {
      const currentIndex = steps.indexOf(current);
      const nextStep = steps[currentIndex + 1];
      return nextStep ?? current;
    });
  }, [steps]);

  const goBack = useCallback(() => {
    setStep((current) => {
      const currentIndex = steps.indexOf(current);
      const previousStep = steps[currentIndex - 1];
      return previousStep ?? current;
    });
  }, [steps]);

  const goToStep = useCallback((target: TStep) => {
    if (steps.includes(target)) {
      setStep(target);
    }
  }, [steps]);

  return useMemo(() => ({
    step,
    setStep,
    stepIndex,
    isFirstStep,
    isLastStep,
    canGoBack: !isFirstStep,
    canGoNext: !isLastStep,
    goNext,
    goBack,
    goToStep,
  }), [goBack, goNext, goToStep, isFirstStep, isLastStep, step, stepIndex]);
}