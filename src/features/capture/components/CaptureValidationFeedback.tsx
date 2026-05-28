import type { ValidationIssue } from '@/foundation/validation/types';
import { ValidationSummaryCard } from '@/foundation/components';

type CaptureValidationFeedbackProps = {
  blockingIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
  focusAnchor: (anchor?: string) => void;
};

export function CaptureValidationFeedback({
  blockingIssues,
  warningIssues,
  focusAnchor,
}: CaptureValidationFeedbackProps) {
  return (
    <>
      {blockingIssues.length > 0 ? (
        <ValidationSummaryCard
          title="Fix before saving"
          issues={blockingIssues}
          onPrimaryAction={() => focusAnchor(blockingIssues[0]?.anchor ?? blockingIssues[0]?.fieldId)}
          primaryActionLabel="Review field"
        />
      ) : null}
      {warningIssues.length > 0 ? (
        <ValidationSummaryCard
          title="Warnings to review"
          issues={warningIssues}
          onPrimaryAction={() => focusAnchor(warningIssues[0]?.anchor ?? warningIssues[0]?.fieldId)}
          primaryActionLabel="Review"
        />
      ) : null}
    </>
  );
}
