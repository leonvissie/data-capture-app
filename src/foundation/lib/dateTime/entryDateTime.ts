function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateForEntryInput(date: Date): string {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function formatTimeForEntryInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function applyDateMask(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function applyTimeMask(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function buildOccurredAtIso(dateInput: string, timeInput: string): { iso: string | null; error: string | null } {
  const dateDigits = dateInput.replace(/[^\d]/g, '');
  const timeDigits = timeInput.replace(/[^\d]/g, '');

  if (dateDigits.length !== 8) return { iso: null, error: 'Date must be in dd/mm/yyyy format.' };
  if (timeDigits.length !== 4) return { iso: null, error: 'Time must be in HH:mm format.' };

  const day = Number(dateDigits.slice(0, 2));
  const month = Number(dateDigits.slice(2, 4));
  const year = Number(dateDigits.slice(4, 8));
  const hours = Number(timeDigits.slice(0, 2));
  const minutes = Number(timeDigits.slice(2, 4));

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return { iso: null, error: 'Date is invalid.' };
  }
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return { iso: null, error: 'Time is invalid.' };
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes;

  if (!isValidDate) return { iso: null, error: 'Date is invalid.' };
  return { iso: date.toISOString(), error: null };
}

export function validateEntryDateTimeNotFuture(dateInput: string, timeInput: string): { error: string | null; fieldId: 'entryDate' | 'entryTime' | null } {
  const occurredAt = buildOccurredAtIso(dateInput, timeInput);
  if (!occurredAt.iso) return { error: occurredAt.error ?? 'Date and time are invalid.', fieldId: 'entryDate' };

  const now = new Date();
  const entry = new Date(occurredAt.iso);

  const entryDateOnly = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate()).getTime();
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (entryDateOnly > nowDateOnly) {
    return { error: 'Date must be today or earlier.', fieldId: 'entryDate' };
  }

  if (entryDateOnly === nowDateOnly && entry.getTime() > now.getTime()) {
    return { error: 'Time must be now or earlier.', fieldId: 'entryTime' };
  }

  return { error: null, fieldId: null };
}
