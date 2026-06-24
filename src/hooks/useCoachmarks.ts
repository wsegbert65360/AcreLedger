import { useCallback, useEffect, useMemo, useState } from 'react';

export type CoachmarkStepId = 'manageFields' | 'weather' | 'activity' | 'reports';

export interface CoachmarkStep {
  id: CoachmarkStepId;
  targetId: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: CoachmarkStep[] = [
  {
    id: 'manageFields',
    targetId: 'coachmark-manage-fields',
    title: 'Add your first field',
    body: 'Tap here to add fields, draw boundaries, and manage your farm layout.',
    placement: 'bottom'
  },
  {
    id: 'weather',
    targetId: 'coachmark-weather',
    title: 'Live weather',
    body: 'Check current conditions, radar, and spray-friendly weather guidance.',
    placement: 'bottom'
  },
  {
    id: 'activity',
    targetId: 'coachmark-activity-tab',
    title: 'Your farm timeline',
    body: 'All planting, spraying, harvest, and grain records live here.',
    placement: 'top'
  },
  {
    id: 'reports',
    targetId: 'coachmark-reports-tab',
    title: 'Compliance exports',
    body: 'Generate FSA, spray, and harvest reports whenever you need them.',
    placement: 'top'
  }
];

function storageKey(userId: string | undefined) {
  const suffix = userId || 'local';
  return `al_coachmarks_shown_${suffix}`;
}

interface UseCoachmarksOptions {
  userId: string | undefined;
  enabled: boolean;
}

export function useCoachmarks({ userId, enabled }: UseCoachmarksOptions) {
  const [isComplete, setIsComplete] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(storageKey(userId)) === '1';
  });
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setIsComplete(window.localStorage.getItem(storageKey(userId)) === '1');
  }, [userId]);

  const isActive = enabled && !isComplete && stepIndex < STEPS.length;
  const currentStep = STEPS[stepIndex];

  const markComplete = useCallback(() => {
    window.localStorage.setItem(storageKey(userId), '1');
    setIsComplete(true);
  }, [userId]);

  const next = useCallback(() => {
    setStepIndex(prev => {
      const nextIndex = prev + 1;
      if (nextIndex >= STEPS.length) {
        markComplete();
      }
      return nextIndex;
    });
  }, [markComplete]);

  const back = useCallback(() => {
    setStepIndex(prev => Math.max(0, prev - 1));
  }, []);

  const skip = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const restart = useCallback(() => {
    window.localStorage.removeItem(storageKey(userId));
    setIsComplete(false);
    setStepIndex(0);
  }, [userId]);

  return useMemo(() => ({
    steps: STEPS,
    stepIndex,
    currentStep,
    isActive,
    isComplete,
    next,
    back,
    skip,
    restart,
    totalSteps: STEPS.length
  }), [stepIndex, currentStep, isActive, isComplete, next, back, skip, restart]);
}
