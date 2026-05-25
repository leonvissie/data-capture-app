import { describe, expect, jest, test } from '@jest/globals';
import { Membership } from '../../data/types';
import { buildMembershipDocumentFreshnessCopy, getMembershipDocumentFreshness } from '../membershipDocumentFreshness';

const makeMembership = (id: string, documentIds: Membership['membershipDocumentIds'] = []): Membership => ({
  id,
  type: 'Membership',
  holderProfileId: 'profile-1',
  associationName: `Membership ${id}`,
  membershipDocumentIds: documentIds,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
  version: 1,
});

describe('membership document freshness', () => {
  test('ignores endorsements', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    const result = getMembershipDocumentFreshness([
      makeMembership('m1', [
        { kind: 'FIREARM_ENDORSEMENT', documentId: 'd1', issueDate: '2025-01-01' },
      ]),
    ]);
    expect(result.status).toBe('unknown');
    jest.useRealTimers();
  });

  test('returns warning for aged membership document issue date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    const result = getMembershipDocumentFreshness([
      makeMembership('m1', [
        { kind: 'ASSOCIATION_MEMBERSHIP', documentId: 'd1', issueDate: '2026-01-01' },
      ]),
    ]);
    expect(result.status).toBe('warning');
    expect(buildMembershipDocumentFreshnessCopy(result)).toContain('more than 70 days old');
    jest.useRealTimers();
  });

  test('returns expired for stale selected membership document issue date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    const result = getMembershipDocumentFreshness([
      makeMembership('m1', [
        { kind: 'DEDICATED_HUNTER_CERT', documentId: 'd1', issueDate: '2025-12-01' },
      ]),
    ]);
    expect(result.status).toBe('expired');
    expect(buildMembershipDocumentFreshnessCopy(result)).toContain('more than 90 days old');
    jest.useRealTimers();
  });
});
