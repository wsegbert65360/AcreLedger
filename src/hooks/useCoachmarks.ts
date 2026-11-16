import { useCallback, useEffect, useMemo, useState } from 'react';

export type CoachmarkStepId = 'addField' | 'quickAdd' | 'activity' | 'reports';

export interface CoachmarkStep {
  id: CoachmarkStepId;
  targetId: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: CoachmarkStep[] = [
  {
    id: 'addField',
    targetId: 'coachmark-add-field',
    title: 'Add your fields',
    body: 'This is where you add a field or draw its boundary on the map.',
    placement: 'bottom'
  },
  {
    id: 'quickAdd',
    targetId: 'coachmark-quick-add',
    title: 'Log a record',
    body: 'Use Quick Add here to record planting, spraying, fertilizer, harvest and hay.',
    placement: 'top'
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
    title: 'Reports',
    body: 'FSA, spray, harvest and year-end exports. Some need Pro.',
    placement: 'top'
  }
];

export const COACHMARKS_RESTART_EVENT = 'al:restart-coachmarks';

function storageKey(userId: string | undefined) {
  const suffix = userId || 'local';
  return `al_coachmarks_shown_${suffix}`;
}

// Storage can be disabled or full (private mode, some WebViews). The tour then
// just lives in memory for this session instead of breaking the app shell.
function readShown(userId: string | undefined): boolean {
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return false;
  }
}

function writeShown(userId: string | undefined, shown: boolean) {
  try {
    if (shown) window.localStorage.setItem(storageKey(userId), '1');
    else window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Ignore: in-memory state still controls this session.
  }
}

interface UseCoachmarksOptions {
  userId: string | undefined;
  enabled: boolean;
}

export function useCoachmarks({ userId, enabled }: UseCoachmarksOptions) {
  const [isComplete, setIsComplete] = useState(() => {
    if (typeof window === 'undefined') return true;
    return readShown(userId);
  });
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setIsComplete(readShown(userId));
  }, [userId]);

  const isActive = enabled && !isComplete && stepIndex < STEPS.length;
  const currentStep = STEPS[stepIndex];

  const markComplete = useCallback(() => {
    writeShown(userId, true);
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
    writeShown(userId, false);
    setIsComplete(false);
    setStepIndex(0);
  }, [userId]);

  useEffect(() => {
    window.addEventListener(COACHMARKS_RESTART_EVENT, restart);
    return () => window.removeEventListener(COACHMARKS_RESTART_EVENT, restart);
  }, [restart]);

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
