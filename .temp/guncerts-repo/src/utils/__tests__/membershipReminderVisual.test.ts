import { describe, expect, jest, test } from '@jest/globals';

jest.mock('../../data/sqlite', () => ({
  listByType: jest.fn(() => []),
}));

jest.mock('../../data/repo', () => ({
  persist: jest.fn(),
  touch: <T,>(value: T) => value,
}));

import { getReminderVisualState } from '../reminderVisuals';

describe('membership reminder visual state', () => {
  test('returns null when membership has not expired', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
    expect(getReminderVisualState('membership', '2026-05-01')).toBeNull();
    jest.useRealTimers();
  });

  test('returns renew visual state when membership expires within 30 days', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
    expect(getReminderVisualState('membership', '2026-03-20')).toEqual(
      expect.objectContaining({
        label: 'Renew membership',
        color: 'orange',
        daysUntil: 8,
      }),
    );
    jest.useRealTimers();
  });

  test('returns renew visual state on expiry date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
    expect(getReminderVisualState('membership', '2026-03-12')).toEqual(
      expect.objectContaining({
        label: 'Renew membership',
        color: 'orange',
        daysUntil: 0,
      }),
    );
    jest.useRealTimers();
  });

  test('returns expired visual state when already expired', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
    expect(getReminderVisualState('membership', '2026-03-11')).toEqual(
      expect.objectContaining({
        label: 'EXPIRED',
        color: 'red',
        daysUntil: -1,
      }),
    );
    jest.useRealTimers();
  });
});
