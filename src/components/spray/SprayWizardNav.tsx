import { WizardNav, type WizardStepDefinition } from '@/components/wizard/WizardNav';
import { type SprayWizardStep } from '@/hooks/useSprayForm';
interface SprayWizardNavProps {
  steps: SprayWizardStep[];
  currentStep: SprayWizardStep;
  onStepClick?: (step: SprayWizardStep) => void;
}

const STEP_LABELS: Record<SprayWizardStep, string> = {
  core: 'Core Info',
  mix: 'Chemical Mix',
  conditions: 'Conditions',
  review: 'Review',
};

const SPRAY_THEME = {
  activeStep: 'bg-spray text-white border-spray',
  completedStep: 'bg-spray/20 text-spray border-spray/50',
  activeLabel: 'text-spray',
  completedConnector: 'bg-spray/50',
};

export function SprayWizardNav({ steps, currentStep, onStepClick }: SprayWizardNavProps) {
  const stepDefinitions: WizardStepDefinition<SprayWizardStep>[] = steps.map((step) => ({
    id: step,
    label: STEP_LABELS[step],
  }));

  return (
    <WizardNav
      steps={stepDefinitions}
      currentStep={currentStep}
      onStepClick={onStepClick}
      ariaLabel="Spray record steps"
      theme={SPRAY_THEME}
    />
  );
}
