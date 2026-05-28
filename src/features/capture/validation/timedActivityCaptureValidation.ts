import type { ValidationIssue } from '@/foundation/validation/types';

import { validateTimeCapture } from './timeCaptureValidation';

type ValidateTimedActivityCaptureInput = {
  entryDate: string;
  entryTime: string;
  activeStartIso?: string | null;
  locationValidationError?: string | null;
};

export function validateTimedActivityCapture(input: ValidateTimedActivityCaptureInput): ValidationIssue[] {
  const next = validateTimeCapture({
    entryDate: input.entryDate,
    entryTime: input.entryTime,
    activeStartIso: input.activeStartIso ?? null,
  });

  if (input.locationValidationError) {
    return [
      {
        key: 'location_invalid',
        severity: 'blocking',
        message: input.locationValidationError,
        fieldId: 'location',
        anchor: 'location',
      },
    ];
  }

  return next;
}
