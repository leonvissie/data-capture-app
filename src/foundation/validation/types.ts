export type ValidationSeverity = 'warning' | 'blocking';

export type ValidationIssue = {
  key: string;
  code?: string;
  message: string;
  severity: ValidationSeverity;
  fieldId?: string;
  anchor?: string;
};

export type ValidationContext = {
  flowId: string;
  mode?: string;
};
