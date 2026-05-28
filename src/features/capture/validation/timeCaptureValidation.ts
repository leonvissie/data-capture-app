import { buildOccurredAtIso } from '@/foundation/lib/dateTime';
import type { ValidationIssue } from '@/foundation/validation/types';

type ValidateTimeCaptureInput = {
  entryDate: string;
  entryTime: string;
  activeStartIso?: string | null;
};

const LONG_DURATION_WARNING_HOURS = 12;

export function validateTimeCapture(input: ValidateTimeCaptureInput): ValidationIssue[] {
  const next: ValidationIssue[] = [];

  if (!input.entryDate.trim()) {
    next.push({
      key: 'entry_date_required',
      severity: 'blocking',
      message: 'Date is required.',
      fieldId: 'entryDate',
      anchor: 'entryDate',
    });
    return next;
  }

  if (!input.entryTime.trim()) {
    next.push({
      key: 'entry_time_required',
      severity: 'blocking',
      message: 'Time is required.',
      fieldId: 'entryTime',
      anchor: 'entryTime',
    });
    return next;
  }

  const occurredAt = buildOccurredAtIso(input.entryDate, input.entryTime);
  if (occurredAt.error || !occurredAt.iso) {
    next.push({
      key: 'entry_datetime_invalid',
      severity: 'blocking',
      message: occurredAt.error ?? 'Date and time are invalid.',
      fieldId: 'entryDate',
      anchor: 'entryDate',
    });
    return next;
  }

  if (input.activeStartIso) {
    const start = new Date(input.activeStartIso).getTime();
    const end = new Date(occurredAt.iso).getTime();
    if (end <= start) {
      next.push({
        key: 'time_end_before_start',
        severity: 'blocking',
        message: 'End time must be later than start time.',
        fieldId: 'entryTime',
        anchor: 'entryTime',
      });
      return next;
    }

    const durationHours = (end - start) / (1000 * 60 * 60);
    if (durationHours > LONG_DURATION_WARNING_HOURS) {
      next.push({
        key: 'time_duration_long_warning',
        severity: 'warning',
        message: `Duration is longer than ${LONG_DURATION_WARNING_HOURS} hours. Confirm this is intended.`,
        fieldId: 'entryTime',
        anchor: 'entryTime',
      });
    }
  }

  return next;
}

