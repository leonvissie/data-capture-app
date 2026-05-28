import { buildOccurredAtIso } from '@/foundation/lib/dateTime';
import type { ValidationIssue } from '@/foundation/validation/types';

type ValidateQuickCountCaptureInput = {
  countValue: string;
  entryDate: string;
  entryTime: string;
  locationValidationError?: string | null;
};

export function validateQuickCountCapture(input: ValidateQuickCountCaptureInput): ValidationIssue[] {
  const trimmed = input.countValue.trim();
  const next: ValidationIssue[] = [];
  const occurredAtResult = buildOccurredAtIso(input.entryDate, input.entryTime);

  if (!input.entryDate.trim()) {
    next.push({ key: 'entry_date_required', severity: 'blocking', message: 'Date is required.', fieldId: 'entryDate', anchor: 'entryDate' });
    return next;
  }
  if (!input.entryTime.trim()) {
    next.push({ key: 'entry_time_required', severity: 'blocking', message: 'Time is required.', fieldId: 'entryTime', anchor: 'entryTime' });
    return next;
  }
  if (occurredAtResult.error) {
    next.push({ key: 'entry_datetime_invalid', severity: 'blocking', message: occurredAtResult.error, fieldId: 'entryDate', anchor: 'entryDate' });
    return next;
  }

  if (input.locationValidationError) {
    next.push({ key: 'location_invalid', severity: 'blocking', message: input.locationValidationError, fieldId: 'location', anchor: 'location' });
    return next;
  }

  if (!trimmed) {
    next.push({ key: 'count_required', severity: 'blocking', message: 'Value is required.', fieldId: 'countValue', anchor: 'countValue' });
    return next;
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    next.push({ key: 'count_invalid', severity: 'warning', message: 'Value must be greater than zero.', fieldId: 'countValue', anchor: 'countValue' });
    return next;
  }

  if (value > 500) {
    next.push({
      key: 'count_high_warning',
      severity: 'warning',
      message: 'This is a high count value. Confirm this is intended.',
      fieldId: 'countValue',
      anchor: 'countValue',
    });
  }

  return next;
}
