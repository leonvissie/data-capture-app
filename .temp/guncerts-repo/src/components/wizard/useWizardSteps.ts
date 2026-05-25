import { useEffect, useMemo, useState } from 'react';

type WizardStepBase = {
  id: string;
  label: string;
};

type UseWizardStepsParams<TStep extends WizardStepBase> = {
  steps: TStep[];
  isStepVisible?: (step: TStep) => boolean;
};

export function useWizardSteps<TStep extends WizardStepBase>({
  steps,
  isStepVisible,
}: UseWizardStepsParams<TStep>) {
  const [stepIndex, setStepIndex] = useState(0);

  const visibleSteps = useMemo(
    () => steps.filter((step) => (isStepVisible ? isStepVisible(step) : true)),
    [isStepVisible, steps]
  );

  useEffect(() => {
    setStepIndex((current) => Math.min(current, Math.max(visibleSteps.length - 1, 0)));
  }, [visibleSteps.length]);

  const currentStep = visibleSteps[stepIndex] ?? visibleSteps[0] ?? null;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex >= Math.max(visibleSteps.length - 1, 0);

  const goToStep = (nextIndex: number) => {
    if (!visibleSteps.length) return;
    const bounded = Math.max(0, Math.min(nextIndex, visibleSteps.length - 1));
    setStepIndex(bounded);
  };

  const goPrevious = () => goToStep(stepIndex - 1);
  const goNext = () => goToStep(stepIndex + 1);

  return {
    visibleSteps,
    currentStep,
    stepIndex,
    setStepIndex,
    isFirstStep,
    isLastStep,
    goToStep,
    goPrevious,
    goNext,
  };
}

