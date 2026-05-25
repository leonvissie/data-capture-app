import { describe, expect, jest, test } from '@jest/globals';
import { Membership } from '../../data/types';
import { buildMembershipSubmissionWarningCopy, getMembershipSubmissionValidity } from '../membershipSubmissionValidity';

const makeMembership = (id: string, membershipExpiresAt?: string): Membership => ({
  id,
  type: 'Membership',
  holderProfileId: 'profile-1',
  associationName: `Membership ${id}`,
  membershipExpiresAt,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
  version: 1,
});

describe('membership submission validity', () => {
  test('returns unknown when no selected memberships have a usable expiry date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T10:00:00.000Z'));
    const result = getMembershipSubmissionValidity([
      makeMembership('m1'),
      makeMembership('m2', 'invalid'),
    ]);

    expect(result.status).toBe('unknown');
    expect(result.nearestDaysUntil).toBeNull();
    expect(buildMembershipSubmissionWarningCopy(result)).toBeNull();
    jest.useRealTimers();
  });

  test('returns ok when the nearest expiry is beyond the configured warning window', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T10:00:00.000Z'));
    const result = getMembershipSubmissionValidity([makeMembership('m1', '2026-10-01')]);

    expect(result.status).toBe('ok');
    expect(result.warningDays).toBe(180);
    expect(result.nearestExpiryDate).toBe('2026-10-01');
    expect(buildMembershipSubmissionWarningCopy(result)).toBeNull();
    jest.useRealTimers();
  });

  test('returns warning when a selected membership expires within the configured window', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T10:00:00.000Z'));
    const result = getMembershipSubmissionValidity([makeMembership('m1', '2026-04-01')]);

    expect(result.status).toBe('warning');
    expect(result.warningIds).toEqual(['m1']);
    expect(buildMembershipSubmissionWarningCopy(result)).toContain('expires in 20 days');
    jest.useRealTimers();
  });

  test('treats expiry today as warning rather than expired', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T10:00:00.000Z'));
    const result = getMembershipSubmissionValidity([makeMembership('m1', '2026-03-12')]);

    expect(result.status).toBe('warning');
    expect(result.nearestDaysUntil).toBe(0);
    jest.useRealTimers();
  });

  test('returns expired when any selected membership has already expired', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-12T10:00:00.000Z'));
    const result = getMembershipSubmissionValidity([
      makeMembership('m1', '2026-03-11'),
      makeMembership('m2', '2026-04-15'),
    ]);

    expect(result.status).toBe('expired');
    expect(result.expiredIds).toEqual(['m1']);
    expect(buildMembershipSubmissionWarningCopy(result)).toContain('has expired');
    jest.useRealTimers();
  });
});
