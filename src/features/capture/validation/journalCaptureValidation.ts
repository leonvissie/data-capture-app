import { buildOccurredAtIso, validateEntryDateTimeNotFuture } from '@/foundation/lib/dateTime';
import type { ValidationIssue } from '@/foundation/validation/types';
import type { JournalSectionDraft } from '@/features/categories/types/journal';

type ValidateJournalCaptureInput = {
  entryDate: string;
  entryTime: string;
  sections: JournalSectionDraft[];
  valuesBySectionId: Record<string, string | string[]>;
  locationValidationError?: string | null;
};

export function validateJournalCapture(input: ValidateJournalCaptureInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.entryDate.trim()) {
    issues.push({ key: 'entry_date_required', severity: 'blocking', message: 'Date is required.', fieldId: 'entryDate', anchor: 'entryDate' });
    return issues;
  }
  if (!input.entryTime.trim()) {
    issues.push({ key: 'entry_time_required', severity: 'blocking', message: 'Time is required.', fieldId: 'entryTime', anchor: 'entryTime' });
    return issues;
  }

  const occurredAt = buildOccurredAtIso(input.entryDate, input.entryTime);
  if (!occurredAt.iso) {
    issues.push({
      key: 'entry_datetime_invalid',
      severity: 'blocking',
      message: occurredAt.error ?? 'Date and time are invalid.',
      fieldId: 'entryDate',
      anchor: 'entryDate',
    });
    return issues;
  }
  const futureValidation = validateEntryDateTimeNotFuture(input.entryDate, input.entryTime);
  if (futureValidation.error) {
    issues.push({
      key: 'entry_datetime_future',
      severity: 'blocking',
      message: futureValidation.error,
      fieldId: futureValidation.fieldId ?? 'entryDate',
      anchor: futureValidation.fieldId ?? 'entryDate',
    });
    return issues;
  }

  if (input.locationValidationError) {
    issues.push({
      key: 'location_invalid',
      severity: 'blocking',
      message: input.locationValidationError,
      fieldId: 'location',
      anchor: 'location',
    });
    return issues;
  }

  for (const section of input.sections) {
    const value = input.valuesBySectionId[section.id];
    const hasValue = Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : false;
    if (!hasValue) {
      issues.push({
        key: `journal_required_${section.id}`,
        severity: section.requiredSeverity,
        message: `${section.label} is required.`,
        fieldId: `journal.${section.id}`,
        anchor: `journal.${section.id}`,
      });
      continue;
    }

    if ((section.type === 'number' || section.type === 'scale') && typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        issues.push({
          key: `journal_number_invalid_${section.id}`,
          severity: 'blocking',
          message: `${section.label} must be a valid number.`,
          fieldId: `journal.${section.id}`,
          anchor: `journal.${section.id}`,
        });
      }
    }
  }

  return issues;
}
