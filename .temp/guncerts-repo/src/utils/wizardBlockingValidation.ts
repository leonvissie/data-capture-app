import { showValidationAlert } from './validationAlert';

export type BlockingIssueKind = 'missing' | 'invalid' | 'duplicate';

export type WizardBlockingIssue = {
  key: string;
  label: string;
  kind: BlockingIssueKind;
  message: string;
};

export type WizardBlockingValidationResult = {
  issues: WizardBlockingIssue[];
  firstIssueKey?: string;
  hasBlockingIssues: boolean;
};

export const buildWizardBlockingResult = (
  issues: WizardBlockingIssue[],
  firstIssueKey?: string,
): WizardBlockingValidationResult => ({
  issues,
  firstIssueKey: firstIssueKey ?? issues[0]?.key,
  hasBlockingIssues: issues.length > 0,
});

export const showWizardBlockingAlert = (
  result: WizardBlockingValidationResult,
  opts?: {
    title?: string;
    intro?: string;
    onPressOk?: () => void;
  },
) => {
  if (!result.issues.length) return;
  showValidationAlert({
    title: opts?.title ?? 'Unable to save',
    intro: opts?.intro ?? 'Please correct the following before saving:',
    items: result.issues.map((issue) => ({
      label: issue.label,
      message: issue.message,
    })),
    onPressOk: opts?.onPressOk,
  });
};
