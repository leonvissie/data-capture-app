import { applyDateMask, applyTimeMask, buildOccurredAtIso, validateEntryDateTimeNotFuture } from '../../src/foundation/lib/dateTime';

describe('entry date/time helpers', () => {
  test('applies date mask dd/mm/yyyy', () => {
    expect(applyDateMask('1')).toBe('1');
    expect(applyDateMask('1203')).toBe('12/03');
    expect(applyDateMask('12032026')).toBe('12/03/2026');
  });

  test('applies time mask HH:mm', () => {
    expect(applyTimeMask('1')).toBe('1');
    expect(applyTimeMask('1234')).toBe('12:34');
  });

  test('buildOccurredAtIso parses a future datetime', () => {
    const nextYear = new Date().getFullYear() + 1;
    const result = buildOccurredAtIso(`01/01/${nextYear}`, '00:00');
    expect(result.iso).not.toBeNull();
    expect(result.error).toBeNull();
  });

  test('validateEntryDateTimeNotFuture rejects future datetime', () => {
    const nextYear = new Date().getFullYear() + 1;
    const result = validateEntryDateTimeNotFuture(`01/01/${nextYear}`, '00:00');
    expect(result.error).toBe('Date must be today or earlier.');
    expect(result.fieldId).toBe('entryDate');
  });
});
