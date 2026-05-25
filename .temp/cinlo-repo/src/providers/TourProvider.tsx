import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { TourOverlay } from '@/features/tour/components/TourOverlay';
import {
  loadTourPrefs,
  resetTourPrefs,
  setTourCompleted,
  setTourIsFirstLoad,
  setTourSavedStep,
} from '@/features/tour/data/repository';
import type { TourPrefs, TourStep, TourTargetLayout } from '@/features/tour/types';

type TourContextValue = {
  isReady: boolean;
  isActive: boolean;
  hasCompleted: boolean;
  shouldAutoStart: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  activeTargetId: string | null;
  targetEpoch: number;
  isCurrentStepReady: boolean;
  steps: TourStep[];
  registerTargetLayout: (targetId: string, layout: TourTargetLayout | null) => void;
  getTargetLayout: (targetId: string) => TourTargetLayout | null;
  startTour: (
    steps: TourStep[],
    options?: { fromStep?: number; resumeSavedStep?: boolean; autoStart?: boolean },
  ) => Promise<void>;
  pauseTour: () => Promise<void>;
  nextStep: () => Promise<void>;
  previousStep: () => Promise<void>;
  skipTour: () => Promise<void>;
  completeTour: () => Promise<void>;
  resetTour: () => Promise<void>;
  setStepReady: (stepId: string, ready: boolean) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: React.PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [savedStepIndex, setSavedStepIndex] = useState(0);

  const [isActive, setIsActive] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showSkipNotice, setShowSkipNotice] = useState(false);
  const [skipResumeStepIndex, setSkipResumeStepIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, TourTargetLayout>>({});
  const [targetEpoch, setTargetEpoch] = useState(0);
  const [stepReadiness, setStepReadiness] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const prefs: TourPrefs = await loadTourPrefs();
        if (cancelled) return;
        setIsFirstLoad(prefs.isFirstLoad);
        setHasCompleted(prefs.hasCompleted);
        setSavedStepIndex(prefs.savedStepIndex);
        setIsReady(true);
      } catch {
        if (!cancelled) setIsReady(true);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentStep = showSkipNotice
    ? ({
        id: 'tour-resume-settings',
        title: 'Tour paused',
        body: 'You can resume this tour any time from the Settings screen.',
        targetId: 'settings-gear-button',
        placement: 'bottom',
      } as TourStep)
    : (steps[currentStepIndex] ?? null);
  const overlayStep = isActive ? currentStep : null;
  const activeTargetId = currentStep?.targetId ?? null;
  const isCompletionNotice = currentStep?.id === 'tour-complete';
  const activeTargetIdRef = useRef<string | null>(activeTargetId);

  useEffect(() => {
    activeTargetIdRef.current = activeTargetId;
  }, [activeTargetId]);

  const registerTargetLayout = useCallback((targetId: string, layout: TourTargetLayout | null) => {
    const currentActiveTargetId = activeTargetIdRef.current;
    if (currentActiveTargetId && targetId !== currentActiveTargetId) return;
    setTargets((prev) => {
      if (!layout) {
        if (!(targetId in prev)) return prev;
        const next = { ...prev };
        delete next[targetId];
        return next;
      }

      const existing = prev[targetId];
      if (
        existing &&
        existing.x === layout.x &&
        existing.y === layout.y &&
        existing.width === layout.width &&
        existing.height === layout.height
      ) {
        return prev;
      }
      return { ...prev, [targetId]: layout };
    });
  }, []);

  const getTargetLayout = useCallback(
    (targetId: string) => {
      return targets[targetId] ?? null;
    },
    [targets],
  );

  const startTour = useCallback(
    async (
      nextSteps: TourStep[],
      options?: { fromStep?: number; resumeSavedStep?: boolean; autoStart?: boolean },
    ) => {
      if (!nextSteps.length) return;
      const startIndex = options?.resumeSavedStep
        ? Math.min(savedStepIndex, nextSteps.length - 1)
        : Math.min(Math.max(0, options?.fromStep ?? 0), nextSteps.length - 1);

      setSteps(nextSteps);
      setCurrentStepIndex(startIndex);
      setIsActive(true);
      setShowSkipNotice(false);
      setHasCompleted(false);
      setSavedStepIndex(startIndex);
      setStepReadiness({});

      const writes: Promise<unknown>[] = [setTourCompleted(false), setTourSavedStep(startIndex)];
      if (options?.autoStart && isFirstLoad) {
        setIsFirstLoad(false);
        writes.push(setTourIsFirstLoad(false));
      }
      await Promise.all(writes);
    },
    [currentStepIndex, isActive, isFirstLoad, savedStepIndex],
  );

  const pauseTour = useCallback(async () => {
    setShowSkipNotice(false);
    setIsActive(false);
    await setTourSavedStep(currentStepIndex);
  }, [currentStepIndex]);

  const completeTour = useCallback(async () => {
    setShowSkipNotice(false);
    setIsActive(false);
    setHasCompleted(true);
    setSavedStepIndex(0);
    setCurrentStepIndex(0);
    await Promise.all([setTourCompleted(true), setTourSavedStep(0)]);
  }, []);

  const nextStep = useCallback(async () => {
    if (!steps.length) return;
    const atEnd = currentStepIndex >= steps.length - 1;
    if (atEnd) {
      await completeTour();
      return;
    }

    const next = currentStepIndex + 1;
    setCurrentStepIndex(next);
    setSavedStepIndex(next);
    await setTourSavedStep(next);
  }, [completeTour, currentStepIndex, steps.length]);

  const previousStep = useCallback(async () => {
    if (!steps.length) return;
    const prev = Math.max(0, currentStepIndex - 1);
    setCurrentStepIndex(prev);
    setSavedStepIndex(prev);
    await setTourSavedStep(prev);
  }, [currentStepIndex, steps.length]);

  const skipTour = useCallback(async () => {
    if (!showSkipNotice) {
      setSkipResumeStepIndex(currentStepIndex);
      setShowSkipNotice(true);
      return;
    }

    // Dismiss paused notice as a pure close action to avoid flashing
    // the underlying tour step before overlay teardown.
    setIsActive(false);
    setShowSkipNotice(false);
    setSavedStepIndex(skipResumeStepIndex);
    await setTourSavedStep(skipResumeStepIndex);
  }, [currentStepIndex, showSkipNotice, skipResumeStepIndex]);

  const resetTour = useCallback(async () => {
    setIsActive(false);
    setIsFirstLoad(true);
    setHasCompleted(false);
    setSavedStepIndex(0);
    setCurrentStepIndex(0);
    setShowSkipNotice(false);
    setSteps([]);
    setStepReadiness({});
    await resetTourPrefs();
  }, []);

  const setStepReady = useCallback((stepId: string, ready: boolean) => {
    setStepReadiness((prev) => {
      if (prev[stepId] === ready) return prev;
      return { ...prev, [stepId]: ready };
    });
  }, []);

  const isCurrentStepReady = showSkipNotice ? true : currentStep ? (stepReadiness[currentStep.id] ?? true) : true;

  useLayoutEffect(() => {
    // Invalidate measured targets before paint when target id changes.
    setTargets({});
    setTargetEpoch((v) => v + 1);
  }, [activeTargetId]);

  const value = useMemo<TourContextValue>(
    () => ({
      isReady,
      isActive,
      hasCompleted,
      shouldAutoStart: isReady && isFirstLoad,
      currentStepIndex,
      currentStep,
      activeTargetId,
      targetEpoch,
      isCurrentStepReady,
      steps,
      registerTargetLayout,
      getTargetLayout,
      startTour,
      pauseTour,
      nextStep,
      previousStep,
      skipTour,
      completeTour,
      resetTour,
      setStepReady,
    }),
    [
      completeTour,
      currentStep,
      currentStepIndex,
      getTargetLayout,
      hasCompleted,
      isFirstLoad,
      isActive,
      isCurrentStepReady,
      isReady,
      nextStep,
      pauseTour,
      previousStep,
      registerTargetLayout,
      resetTour,
      setStepReady,
      skipTour,
      startTour,
      steps,
      targetEpoch,
    ],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay
        visible={!!overlayStep}
        step={overlayStep}
        stepIndex={currentStepIndex}
        totalSteps={steps.length}
        canProceed={isCurrentStepReady}
        dismissOnly={showSkipNotice || isCompletionNotice}
        dismissLabel={isCompletionNotice ? 'Get started' : 'OK'}
        hideActions={
          currentStep?.id === 'reset-current-filters' ||
          currentStep?.id === 'select-general-filter' ||
          currentStep?.id === 'general-clear-filter'
        }
        hideBack={currentStep?.id === 'general-results-count'}
        targetLayout={currentStep?.targetId ? getTargetLayout(currentStep.targetId) : null}
        onBack={() => {
          void previousStep();
        }}
        onNext={() => {
          if (showSkipNotice) {
            void skipTour();
            return;
          }
          void nextStep();
        }}
        onSkip={() => {
          void skipTour();
        }}
      />
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      isReady: false,
      isActive: false,
      hasCompleted: false,
      shouldAutoStart: false,
      currentStepIndex: 0,
      currentStep: null,
      activeTargetId: null,
      targetEpoch: 0,
      isCurrentStepReady: true,
      steps: [],
      registerTargetLayout: () => {},
      getTargetLayout: () => null,
      startTour: async () => {},
      pauseTour: async () => {},
      nextStep: async () => {},
      previousStep: async () => {},
      skipTour: async () => {},
      completeTour: async () => {},
      resetTour: async () => {},
      setStepReady: () => {},
    } as TourContextValue;
  }
  return ctx;
}
