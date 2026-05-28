import { validateTimeCapture } from '../../src/features/capture/validation/timeCaptureValidation';

describe('validateTimeCapture', () => {
  test('requires end > start when active interval exists', () => {
    const issues = validateTimeCapture({
      entryDate: '28/05/2026',
      entryTime: '09:00',
      activeStartIso: new Date(2026, 4, 28, 10, 0, 0, 0).toISOString(),
    });
    expect(issues.some((issue) => issue.key === 'time_end_before_start' && issue.severity === 'blocking')).toBe(true);
  });

  test('warns on long duration', () => {
    const issues = validateTimeCapture({
      entryDate: '27/05/2026',
      entryTime: '23:00',
      activeStartIso: new Date(2026, 4, 27, 8, 0, 0, 0).toISOString(),
    });
    expect(issues.some((issue) => issue.key === 'time_duration_long_warning' && issue.severity === 'warning')).toBe(true);
  });
});
