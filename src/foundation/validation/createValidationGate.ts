import type { ValidationIssue } from './types';

export type ValidationGatePolicy = {
  allowContinueOnWarnings: boolean;
};

export type ValidationGateDecision =
  | { kind: 'proceed'; issues: ValidationIssue[] }
  | { kind: 'continue_with_warnings'; issues: ValidationIssue[]; firstAnchor?: string; firstFieldId?: string }
  | { kind: 'blocked'; issues: ValidationIssue[]; firstAnchor?: string; firstFieldId?: string };

export function createValidationGate(issues: ValidationIssue[], policy: ValidationGatePolicy): ValidationGateDecision {
  const blocking = issues.filter((issue) => issue.severity === 'blocking');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  if (blocking.length > 0) {
    return {
      kind: 'blocked',
      issues,
      firstAnchor: blocking.find((i) => i.anchor)?.anchor,
      firstFieldId: blocking.find((i) => i.fieldId)?.fieldId,
    };
  }

  if (warnings.length > 0 && policy.allowContinueOnWarnings) {
    return {
      kind: 'continue_with_warnings',
      issues,
      firstAnchor: warnings.find((i) => i.anchor)?.anchor,
      firstFieldId: warnings.find((i) => i.fieldId)?.fieldId,
    };
  }

  return { kind: 'proceed', issues };
}
