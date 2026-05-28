import { useMemo } from 'react';

import type { ValidationIssue } from '@/foundation/validation/types';

export function useCaptureValidationState(issues: ValidationIssue[]) {
  return useMemo(() => {
    const fieldStateById: Record<string, 'default' | 'warning' | 'blocking'> = {};
    const blockingIssues: ValidationIssue[] = [];
    const warningIssues: ValidationIssue[] = [];

    for (const issue of issues) {
      if (issue.severity === 'blocking') {
        blockingIssues.push(issue);
      } else if (issue.severity === 'warning') {
        warningIssues.push(issue);
      }

      if (!issue.fieldId) continue;
      if (issue.severity === 'blocking') {
        fieldStateById[issue.fieldId] = 'blocking';
      } else if (fieldStateById[issue.fieldId] !== 'blocking') {
        fieldStateById[issue.fieldId] = 'warning';
      }
    }

    return { fieldStateById, blockingIssues, warningIssues };
  }, [issues]);
}
