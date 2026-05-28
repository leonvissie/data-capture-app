import type { ValidationIssue } from '@/foundation/validation/types';
import { createValidationGate } from '@/foundation/validation/createValidationGate';

type SubmitWithValidationOptions = {
  issues: ValidationIssue[];
  setIssues: (issues: ValidationIssue[]) => void;
  focusAnchor: (key?: string) => void;
  onProceed: () => Promise<void>;
  requestWarningConfirm: (warningMessages: string[]) => Promise<boolean>;
};

export async function submitWithValidation({
  issues,
  setIssues,
  focusAnchor,
  onProceed,
  requestWarningConfirm,
}: SubmitWithValidationOptions): Promise<void> {
  setIssues(issues);
  const gate = createValidationGate(issues, { allowContinueOnWarnings: false });

  if (gate.kind === 'blocked') {
    focusAnchor(gate.firstAnchor ?? gate.firstFieldId);
    return;
  }

  if (gate.kind === 'continue_with_warnings') {
    const warningMessages = issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message);
    const shouldContinue = await requestWarningConfirm(warningMessages);
    if (!shouldContinue) {
      focusAnchor(gate.firstAnchor ?? gate.firstFieldId);
      return;
    }
  }

  await onProceed();
}

